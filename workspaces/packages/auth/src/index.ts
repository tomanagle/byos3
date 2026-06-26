import { apiKey } from "@better-auth/api-key";
import { stripe as stripePlugin } from "@better-auth/stripe";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import { and, eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import Stripe from "stripe";
import { createId } from "@byos3/core";
import { ac, NAMESPACE_ROLES, PLATFORM_ROLES, platformAc } from "@byos3/core/authz";
import * as schema from "@byos3/db/auth-schema";
import { PAID_LIMITS, PLAN_NAME } from "@byos3/protocol";

// The single Better Auth configuration, shared by BOTH Workers (apps/web for sessions, apps/api for
// API-key verification) so the auth model - tables, plugins, roles - is defined exactly once.
// Pure: it reads no globals; the caller passes the D1-backed drizzle instance + secrets. See
// agents/docs/auth.md, rbac.md, api.md.

type Adapter = {
  create: (args: { model: string; data: Record<string, unknown> }) => Promise<unknown>;
};

export interface CreateAuthOptions {
  db: DrizzleD1Database<Record<string, never>>;
  secret?: string;
  baseURL?: string;
  trustedOrigins?: string[];
  /** Billing (only wired when `secretKey` is set; api worker omits it). See billing.md. */
  stripe?: {
    secretKey?: string;
    webhookSecret?: string;
    priceMonthly?: string;
    priceAnnual?: string;
  };
  /** GitHub OAuth (only enabled when both id + secret are set). Callback: /api/auth/callback/github. */
  github?: { clientId?: string; clientSecret?: string };
}

/**
 * The single seat-based plan. Billing is scoped to the namespace/organization (`referenceId` = org
 * id), so `authorizeReference` only lets an org owner/admin manage that org's subscription. Returns
 * null when no Stripe key is configured (core local dev + the api worker run without billing).
 */
function buildStripe(opts: CreateAuthOptions): BetterAuthPlugin | null {
  const cfg = opts.stripe;
  if (!cfg?.secretKey) return null;
  const client = new Stripe(cfg.secretKey, { httpClient: Stripe.createFetchHttpClient() });
  return stripePlugin({
    stripeClient: client,
    stripeWebhookSecret: cfg.webhookSecret ?? "",
    createCustomerOnSignUp: true,
    subscription: {
      enabled: true,
      plans: [
        {
          name: PLAN_NAME,
          priceId: cfg.priceMonthly,
          annualDiscountPriceId: cfg.priceAnnual,
          limits: { ...PAID_LIMITS },
        },
      ],
      // Org-scoped: only an owner/admin of the namespace may manage its billing.
      authorizeReference: async ({ user, referenceId }) => {
        const rows = await opts.db
          .select({ role: schema.member.role })
          .from(schema.member)
          .where(
            and(eq(schema.member.organizationId, referenceId), eq(schema.member.userId, user.id)),
          )
          .limit(1);
        return rows[0]?.role === "owner" || rows[0]?.role === "admin";
      },
    },
  }) as BetterAuthPlugin;
}

export function createAuth(opts: CreateAuthOptions) {
  const stripe = buildStripe(opts);
  // GitHub OAuth, only when both credentials are present (otherwise email/password only).
  const socialProviders =
    opts.github?.clientId && opts.github.clientSecret
      ? { github: { clientId: opts.github.clientId, clientSecret: opts.github.clientSecret } }
      : undefined;
  return betterAuth({
    secret: opts.secret,
    baseURL: opts.baseURL,
    database: drizzleAdapter(opts.db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true },
    socialProviders,
    trustedOrigins: opts.trustedOrigins ?? [],
    plugins: [
      // Namespace ≡ organization. Member roles (owner/admin/writer/reader) authorize tenant content.
      organization({
        ac,
        roles: NAMESPACE_ROLES,
        schema: {
          organization: {
            additionalFields: {
              type: { type: "string", required: false },
              defaultVolumeId: { type: "string", required: false },
            },
          },
        },
      }),
      // Platform roles (admin/support/user) govern administering the SERVICE - never tenant content.
      admin({
        ac: platformAc,
        roles: PLATFORM_ROLES,
        defaultRole: "user",
        adminRoles: ["admin"],
      }),
      // Programmatic auth. Keys are OWNED BY THE ORGANIZATION (`references: "organization"`), so a
      // key's `referenceId` is the namespace/org id, not a user - any org admin can list/revoke it
      // and it outlives the member who minted it. A key's `permissions` (Record<resource, actions[]>)
      // become the request's keyScopes; the api Worker authorizes them against the key's NAMESPACE
      // (not a user role) - see @byos3/services authz + api.md. `metadata` carries the key's volume
      // scope (`{ volumes: "*" | string[] }`) so file ops can be limited to specific volumes (api.md).
      // Default header: x-api-key.
      apiKey({ references: "organization", enableMetadata: true }),
      // Billing (Stripe). Mounts /api/auth/stripe/* incl. the webhook. Omitted without a key.
      ...(stripe ? [stripe] : []),
    ],
    databaseHooks: {
      user: {
        create: {
          // On signup, create the user's personal namespace (= a personal organization) + owner member.
          after: async (createdUser, ctx) => {
            try {
              const adapter = (ctx as { context?: { adapter?: Adapter } })?.context?.adapter;
              if (!adapter) return;
              const now = new Date();
              const orgId = createId("ns");
              await adapter.create({
                model: "organization",
                data: {
                  id: orgId,
                  name: "Personal",
                  slug: `personal-${createdUser.id}`,
                  createdAt: now,
                  type: "personal",
                },
              });
              await adapter.create({
                model: "member",
                data: {
                  id: createId("mem"),
                  organizationId: orgId,
                  userId: createdUser.id,
                  role: "owner",
                  createdAt: now,
                },
              });
            } catch (err) {
              console.error("personal-org hook failed", err);
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
