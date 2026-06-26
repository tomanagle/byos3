import { AppError } from "@byos3/core";
import { authorize, resourceCan } from "@byos3/core/authz";
import type { ServiceContext } from "./context";

function keyScopeOk(ctx: ServiceContext, resource: string, act: string): boolean {
  return !ctx.principal.keyScopes || (ctx.principal.keyScopes[resource]?.includes(act) ?? false);
}

/**
 * Org-owned API keys authorize by NAMESPACE, not by a user role: the key may act on its own
 * namespace and every resource in it, intersected with the key's scopes. Returns true if this is a
 * key principal whose namespace is `namespaceId` and the scope permits the action; throws forbidden
 * if it is a key principal scoped to a DIFFERENT namespace / lacking the scope; returns false when
 * this is NOT a key principal (so the caller falls through to user-role authorization). See api.md.
 */
function keyNamespaceAllows(
  ctx: ServiceContext,
  namespaceId: string | null,
  resource: string,
  act: string,
  action: `${string}:${string}`,
): boolean {
  const keyNs = ctx.principal.keyNamespaceId;
  if (!keyNs) return false; // session principal - use the user-role path
  if (namespaceId !== keyNs || !keyScopeOk(ctx, resource, act)) {
    throw new AppError("forbidden", action);
  }
  return true;
}

/**
 * Namespace-scoped authorization. Session principals are authorized by their org membership role;
 * org-owned API-key principals are authorized by their namespace (no role lookup). For API keys the
 * action must also be within the key's scopes. Throws on denial.
 */
export async function assertCan(
  ctx: ServiceContext,
  namespaceId: string,
  action: `${string}:${string}`,
): Promise<void> {
  const [resource, act] = action.split(":");
  if (keyNamespaceAllows(ctx, namespaceId, resource, act, action)) return;
  const role = await ctx.memberships.roleFor(ctx.principal.userId, namespaceId);
  const decision = authorize({
    principal: { userId: ctx.principal.userId, platformRole: ctx.principal.platformRole },
    membership: role ? { role } : null,
    action,
  });
  if (!decision.allow || !keyScopeOk(ctx, resource, act)) throw new AppError("forbidden", action);
}

/**
 * Resource-level authorization on a VOLUME (rbac.md). Session principals: the caller's role on the
 * volume must permit the action. Org-key principals: the volume must live in the key's namespace.
 * For API keys the key scope must also permit it. Deny-by-default.
 */
export async function assertCanVolume(
  ctx: ServiceContext,
  volumeId: string,
  action: `${string}:${string}`,
): Promise<void> {
  const [resource, act] = action.split(":");
  if (ctx.principal.keyNamespaceId) {
    const ns = await ctx.volumes.namespaceOf(volumeId);
    keyNamespaceAllows(ctx, ns, resource, act, action);
    // A key may additionally be restricted to specific volumes (api.md). Absent / "*" = all.
    const vols = ctx.principal.keyVolumeScope;
    if (Array.isArray(vols) && !vols.includes(volumeId)) throw new AppError("forbidden", action);
    return;
  }
  const role = await ctx.access.volumeRoleFor(ctx.principal.userId, volumeId);
  if (!role || !resourceCan(role, resource, act) || !keyScopeOk(ctx, resource, act)) {
    throw new AppError("forbidden", action);
  }
}

/**
 * Resource-level authorization on a CONNECTOR (the credential). Connectors are not namespace-scoped
 * in the schema and no API route reaches this for key callers, so org-key principals are denied
 * here (deny-by-default); only session principals (per-connector role) are authorized.
 */
export async function assertCanConnector(
  ctx: ServiceContext,
  connectorId: string,
  action: `${string}:${string}`,
): Promise<void> {
  const [resource, act] = action.split(":");
  if (ctx.principal.keyNamespaceId) throw new AppError("forbidden", action);
  const role = await ctx.access.connectorRoleFor(ctx.principal.userId, connectorId);
  if (!role || !resourceCan(role, resource, act) || !keyScopeOk(ctx, resource, act)) {
    throw new AppError("forbidden", action);
  }
}
