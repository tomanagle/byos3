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
} from "@byos3/db";
import { createDriver } from "@byos3/s3";
import type { ServiceContext } from "@byos3/services";
import { auth } from "./auth";

/**
 * Composition root - the ONLY place bindings/secrets are read (code-architecture.md). Resolves the
 * Better Auth SESSION → Principal and builds a ServiceContext over a per-request D1 read-replica
 * session. Returns null when unauthenticated. Server-only (this module imports `cloudflare:workers`
 * and is only reached from the web's server-function middleware).
 */
export async function createServiceContext(headers: Headers): Promise<ServiceContext | null> {
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session?.user) return null;

  const e = env as { CREDENTIAL_ENCRYPTION_KEY: string; STRIPE_SECRET_KEY?: string };
  const db = createSessionDb(env.DB);
  const vault = new CredentialVault(e.CREDENTIAL_ENCRYPTION_KEY);
  const connectors = new D1ConnectorRepository(db, vault, createDriver);
  return {
    principal: {
      userId: session.user.id,
      platformRole: (session.user as { role?: PlatformRole }).role,
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
