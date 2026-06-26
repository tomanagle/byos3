import type { MiddlewareHandler } from "hono";

import { createAuth } from "@byos3/auth";
import { CredentialVault } from "@byos3/crypto";
import {
  D1ConnectorRepository,
  D1MembershipRepository,
  D1ResourceAccessRepository,
  D1VolumeRepository,
} from "@byos3/db";
import { createDriver } from "@byos3/s3";
import type { ServiceContext } from "@byos3/services";

import { ApiError } from "@/lib/errors";
import type { ApiContext } from "@/types";

/** The fields we rely on from the apiKey plugin's verify result. */
interface VerifiedKey {
  id: string;
  referenceId: string;
  permissions: Record<string, string[]> | null;
  metadata: { volumes?: "*" | string[] } | null;
}

/**
 * Authentication at the edge: `Authorization: Bearer <key>` → Better Auth `verifyApiKey` → a
 * `ServiceContext`. Keys are org-owned, so the verified key's `referenceId` is the **namespace** the
 * key belongs to: we put it on the principal as `keyNamespaceId` (authorization is namespace-scoped
 * in `@byos3/services`, never a user-role lookup) and set `userId` to that namespace's owner purely
 * so resource creation can attribute an owner. The key's `permissions` become keyScopes. See api.md.
 */
export function authMiddleware(): MiddlewareHandler<ApiContext> {
  return async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
      throw new ApiError({
        type: "authentication_error",
        code: "authentication_required",
        message: "Missing Authorization: Bearer <key> header.",
        status: 401,
      });
    }

    const presented = header.slice("Bearer ".length).trim();
    const db = c.get("db");
    const auth = createAuth({ db, secret: c.env.BETTER_AUTH_SECRET });
    const result = await auth.api.verifyApiKey({ body: { key: presented } });
    if (!result.valid || !result.key) {
      throw new ApiError({
        type: "authentication_error",
        code: "invalid_api_key",
        message: "Invalid or expired API key.",
        status: 401,
      });
    }

    const key = result.key as unknown as VerifiedKey;
    const scopes = key.permissions ?? null;
    // Keys are org-owned: referenceId IS the namespace. Resolve its owner for resource attribution.
    const namespaceId = key.referenceId;
    const memberships = new D1MembershipRepository(db);
    const ownerUserId = await memberships.namespaceOwner(namespaceId);
    if (!ownerUserId) {
      throw new ApiError({
        type: "authentication_error",
        code: "invalid_api_key",
        message: "API key references a namespace with no owner.",
        status: 401,
      });
    }
    const vault = new CredentialVault(c.env.CREDENTIAL_ENCRYPTION_KEY);
    const connectors = new D1ConnectorRepository(db, vault, createDriver);
    const ctx: ServiceContext = {
      principal: {
        userId: ownerUserId,
        keyNamespaceId: namespaceId,
        keyScopes: scopes ?? undefined,
        keyVolumeScope: key.metadata?.volumes,
      },
      connectors,
      volumes: new D1VolumeRepository(db, connectors),
      memberships,
      access: new D1ResourceAccessRepository(db),
      vault,
      driverFactory: createDriver,
    };

    c.set("ctx", ctx);
    c.set("scopes", scopes);

    const span = c.get("span");
    span.set({ "api.key.id": key.id, "api.namespace.id": namespaceId });

    await next();
  };
}
