import { env } from "cloudflare:workers";
import { CredentialVault } from "@byos3/crypto";
import type { PlatformRole } from "@byos3/core/authz";
import {
  createSessionDb,
  D1ConnectorRepository,
  D1MembershipRepository,
  D1ResourceAccessRepository,
  D1SubscriptionRepository,
  D1VolumeRepository,
  type Database,
} from "@byos3/db";
import { createDriver } from "@byos3/s3";
import type { ServiceContext } from "@byos3/services";
import { auth } from "./auth";

/**
 * Resolve the caller's ACTIVE namespace (the workspace they're in). We do NOT force a personal org at
 * signup; instead:
 *   1. honor `session.activeOrganizationId` when the user is still a member of it (the switcher sets it);
 *   2. else default to one of their memberships, preferring a team org over their personal one, and
 *      pin it active so it's stable across requests;
 *   3. else (they belong to none) lazily create a "Personal" org - which `createOrganization` makes
 *      active automatically. An invited user who accepts first already has (1)/(2), so they never get
 *      a redundant personal org. See agents/docs/rbac.md, billing.md.
 * `createOrganization` is concurrency-safe via the unique `personal-<userId>` slug: a parallel
 * first-load request that loses the race just re-reads the now-existing membership.
 */
async function resolveActiveNamespace(
  headers: Headers,
  db: Database,
  userId: string,
  activeId: string | null,
): Promise<string> {
  const memberships = new D1MembershipRepository(db);
  if (activeId && (await memberships.roleFor(userId, activeId))) return activeId;

  const mine = await memberships.listNamespaces(userId);
  if (mine.length > 0) {
    const def = mine.find((m) => !m.slug.startsWith("personal-")) ?? mine[0];
    await auth.api
      .setActiveOrganization({ headers, body: { organizationId: def.id } })
      .catch(() => {});
    return def.id;
  }

  try {
    const org = (await auth.api.createOrganization({
      headers,
      body: { name: "Personal", slug: `personal-${userId}` },
    })) as { id: string } | null;
    if (org?.id) return org.id;
  } catch {
    // Lost the create race (slug already taken) - fall through to re-read.
  }
  const again = await memberships.listNamespaces(userId);
  if (again.length > 0) return again[0].id;
  throw new Error("could not resolve a namespace");
}

/**
 * Composition root - the ONLY place bindings/secrets are read (code-architecture.md). Resolves the
 * Better Auth SESSION → Principal (including the active namespace) and builds a ServiceContext over a
 * per-request D1 read-replica session. Returns null when unauthenticated. Server-only (imports
 * `cloudflare:workers`; reached only from the web's server-function middleware + the WS route).
 */
export async function createServiceContext(headers: Headers): Promise<ServiceContext | null> {
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session?.user) return null;

  const e = env as { CREDENTIAL_ENCRYPTION_KEY: string; STRIPE_SECRET_KEY?: string };
  const db = createSessionDb(env.DB);
  const activeId =
    (session.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
  const activeNamespaceId = await resolveActiveNamespace(headers, db, session.user.id, activeId);

  const vault = new CredentialVault(e.CREDENTIAL_ENCRYPTION_KEY);
  const connectors = new D1ConnectorRepository(db, vault, createDriver);
  return {
    principal: {
      userId: session.user.id,
      platformRole: (session.user as { role?: PlatformRole }).role,
      activeNamespaceId,
    },
    connectors,
    volumes: new D1VolumeRepository(db, connectors),
    memberships: new D1MembershipRepository(db),
    access: new D1ResourceAccessRepository(db),
    subscriptions: new D1SubscriptionRepository(db),
    // No Stripe key => billing off => every entitlement gate is lifted (self-hosting). See billing.md.
    billingEnabled: Boolean(e.STRIPE_SECRET_KEY),
    vault,
    driverFactory: createDriver,
  };
}
