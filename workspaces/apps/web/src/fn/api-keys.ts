import {
  ApiKeyCreateInput,
  ApiKeyIdInput,
  ApiKeyUpdateInput,
  type ApiKeyVolumeScope,
} from "@byos3/protocol";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { authMiddleware } from "#/lib/middleware";
import { auth } from "#/server/auth";

/**
 * API keys are OWNED BY THE ORGANIZATION (Better Auth `references: "organization"`), so every key
 * here is scoped to the caller's namespace (`context.namespaceId`), never their user. Any owner/admin
 * of the org sees + manages the same keys, and a key outlives the member who minted it. The api
 * Worker authorizes a verified key against its namespace. See agents/docs/api.md, auth.md.
 */

/** A key as shown in the UI - the plaintext secret is NEVER part of this (it is returned once, on create). */
export interface ApiKeySummary {
  id: string;
  name: string | null;
  /** First few chars (incl. prefix) so the user can recognize a key. Not the secret. */
  start: string | null;
  permissions: Record<string, string[]> | null;
  /** Volume scope for file ops: `"*"` / null = all volumes, else the allowed volume ids. */
  volumes: ApiKeyVolumeScope | null;
  enabled: boolean;
  createdAt: number;
  expiresAt: number | null;
  lastRequest: number | null;
  requestCount: number;
}

const ms = (d: Date | number | null | undefined): number | null =>
  d == null ? null : d instanceof Date ? d.getTime() : d;

/**
 * List the org's keys. `listApiKeys` requires a session, so we forward the request headers AND scope
 * the query to the caller's namespace - the user must be a member of it (they always are: it is their
 * own org). The secret/hash is never selected into the summary.
 */
export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ApiKeySummary[]> => {
    context.span.set({ fn: "listApiKeys" });
    if (!context.namespaceId) return [];
    // listApiKeys returns `{ apiKeys, total, limit, offset }` - not a bare array.
    const { apiKeys } = await auth.api.listApiKeys({
      query: { organizationId: context.namespaceId },
      headers: getRequestHeaders(),
    });
    context.span.set({ "api_key.count": apiKeys.length });
    return apiKeys.map((k) => ({
      id: k.id,
      name: k.name,
      start: k.start,
      permissions: k.permissions ?? null,
      volumes: (k.metadata as { volumes?: ApiKeyVolumeScope } | null)?.volumes ?? null,
      enabled: k.enabled,
      createdAt: ms(k.createdAt) ?? 0,
      expiresAt: ms(k.expiresAt),
      lastRequest: ms(k.lastRequest),
      requestCount: k.requestCount ?? 0,
    }));
  });

/**
 * Mint a scoped key OWNED BY the caller's org. Setting `permissions` is a server-only Better Auth
 * operation, so we create with explicit `organizationId` (ownership) + `userId` (the authoring
 * member) and no forwarded headers. The plaintext key is returned ONCE and never stored.
 */
export const createApiKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(ApiKeyCreateInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "createApiKey" });
    if (!context.namespaceId) throw new Error("no namespace");
    // Volume scope only applies to file ops; a key with no file permission gets none. Default "*".
    const hasFilePerms = (data.permissions?.file?.length ?? 0) > 0;
    const volumes = hasFilePerms ? (data.volumes ?? "*") : undefined;
    const key = await auth.api.createApiKey({
      body: {
        organizationId: context.namespaceId,
        userId: context.ctx.principal.userId,
        name: data.name ?? "api key",
        permissions: data.permissions,
        expiresIn: data.expiresIn,
        metadata: volumes === undefined ? undefined : { volumes },
      },
    });
    // Log the key id only - the plaintext `key.key` is a bearer secret and must NEVER be logged.
    context.span.set({ "api_key.id": key.id });
    return { id: key.id, key: key.key, start: key.start };
  });

/** Confirm a key belongs to the caller's org before mutating it (the update/delete endpoints take a
 * bare keyId, so we enforce org scoping here). Throws if it is not one of the org's keys. */
async function assertOwnedByOrg(namespaceId: string, keyId: string): Promise<void> {
  const { apiKeys } = await auth.api.listApiKeys({
    query: { organizationId: namespaceId },
    headers: getRequestHeaders(),
  });
  if (!apiKeys.some((k) => k.id === keyId)) throw new Error("not found");
}

/** Rename and/or enable/disable an org key. */
export const updateApiKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(ApiKeyUpdateInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "updateApiKey", "api_key.id": data.keyId });
    if (!context.namespaceId) throw new Error("no namespace");
    await assertOwnedByOrg(context.namespaceId, data.keyId);
    await auth.api.updateApiKey({
      body: { keyId: data.keyId, name: data.name, enabled: data.enabled },
    });
    return { ok: true };
  });

/** Revoke (delete) an org key. */
export const deleteApiKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(ApiKeyIdInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "deleteApiKey", "api_key.id": data.keyId });
    if (!context.namespaceId) throw new Error("no namespace");
    await assertOwnedByOrg(context.namespaceId, data.keyId);
    await auth.api.deleteApiKey({ body: { keyId: data.keyId }, headers: getRequestHeaders() });
    return { ok: true };
  });
