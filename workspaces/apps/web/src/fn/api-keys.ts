import { ApiKeyCreateInput } from "@byos3/protocol";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/lib/middleware";
import { auth } from "#/server/auth";

/**
 * Mint a scoped API key for the signed-in user. Setting a key's `permissions` is a SERVER-ONLY
 * Better Auth operation, so we create it with an explicit `userId` (from the authed context) and no
 * forwarded headers. The plaintext key is returned ONCE and never stored. See agents/docs/api.md.
 */
export const createApiKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(ApiKeyCreateInput)
  .handler(async ({ context, data }) => {
    context.span.set({ fn: "createApiKey" });
    const key = await auth.api.createApiKey({
      body: {
        userId: context.ctx.principal.userId,
        name: data.name ?? "api key",
        permissions: data.permissions,
        expiresIn: data.expiresIn,
      },
    });
    // Log the key id only - the plaintext `key.key` is a bearer secret and must NEVER be logged.
    context.span.set({ "api_key.id": key.id });
    return { id: key.id, key: key.key, start: key.start };
  });
