import { apiKey } from "@better-auth/api-key";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { organization } from "better-auth/plugins/organization";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { ac, NAMESPACE_ROLES, PLATFORM_ROLES, platformAc } from "@byos3/core/authz";
import * as schema from "@byos3/db/auth-schema";

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
}

export function createAuth(opts: CreateAuthOptions) {
  return betterAuth({
    secret: opts.secret,
    baseURL: opts.baseURL,
    database: drizzleAdapter(opts.db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: true },
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
      // Programmatic auth. A key's `permissions` (Record<resource, actions[]>) become the request's
      // keyScopes, intersected with the owner's role in @byos3/services. Default header: x-api-key.
      apiKey(),
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
              const orgId = crypto.randomUUID();
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
                  id: crypto.randomUUID(),
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
