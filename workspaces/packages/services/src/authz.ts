import { AppError } from "@byos3/core";
import { authorize, resourceCan } from "@byos3/core/authz";
import type { ServiceContext } from "./context";

function keyScopeOk(ctx: ServiceContext, resource: string, act: string): boolean {
  return !ctx.principal.keyScopes || (ctx.principal.keyScopes[resource]?.includes(act) ?? false);
}

/**
 * Namespace-scoped authorization (org membership). Still used for namespace-level ops. For
 * API-key principals the action must also be within the key's scopes. Throws on denial.
 */
export async function assertCan(
  ctx: ServiceContext,
  namespaceId: string,
  action: `${string}:${string}`,
): Promise<void> {
  const [resource, act] = action.split(":");
  const role = await ctx.memberships.roleFor(ctx.principal.userId, namespaceId);
  const decision = authorize({
    principal: { userId: ctx.principal.userId, platformRole: ctx.principal.platformRole },
    membership: role ? { role } : null,
    action,
  });
  if (!decision.allow || !keyScopeOk(ctx, resource, act)) throw new AppError("forbidden", action);
}

/**
 * Resource-level authorization on a VOLUME (rbac.md): allowed iff the caller's role on the volume
 * permits the action AND (for API keys) the key scope permits it. Deny-by-default.
 */
export async function assertCanVolume(
  ctx: ServiceContext,
  volumeId: string,
  action: `${string}:${string}`,
): Promise<void> {
  const [resource, act] = action.split(":");
  const role = await ctx.access.volumeRoleFor(ctx.principal.userId, volumeId);
  if (!role || !resourceCan(role, resource, act) || !keyScopeOk(ctx, resource, act)) {
    throw new AppError("forbidden", action);
  }
}

/** Resource-level authorization on a CONNECTOR (the credential). */
export async function assertCanConnector(
  ctx: ServiceContext,
  connectorId: string,
  action: `${string}:${string}`,
): Promise<void> {
  const [resource, act] = action.split(":");
  const role = await ctx.access.connectorRoleFor(ctx.principal.userId, connectorId);
  if (!role || !resourceCan(role, resource, act) || !keyScopeOk(ctx, resource, act)) {
    throw new AppError("forbidden", action);
  }
}
