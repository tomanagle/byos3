import { roleCan, type Role } from "./policy";
import { platformCan, type PlatformRole } from "./platform";

export interface Grant {
  subtreeNodeGid: string;
  role: Role;
}
export interface ShareLink {
  subtreeNodeGid: string;
}

export interface AuthzInput {
  principal: { userId: string; platformRole?: PlatformRole };
  /** The caller's role in the target namespace, if a member. */
  membership?: { role: Role } | null;
  /** Resource grants that apply to the target's ancestor path. */
  grants?: Grant[];
  /** A validated public-link token, if any (read-only). */
  link?: ShareLink | null;
  action: `${string}:${string}`;
  node?: { gid: string; path: string };
}

export interface AuthzDecision {
  allow: boolean;
  reason: "platform" | "role" | "grant" | "link" | "denied";
}

/** Resources owned by the platform admin plugin - the only ones platform scope may act on directly. */
const PLATFORM_RESOURCES = new Set(["user", "session"]);

function covers(subtreeNodeGid: string, node?: { gid: string; path: string }): boolean {
  if (!node) return false;
  // Phase-1 ancestry: exact node, or the gid appears on the node's path. Full path resolution
  // lands with the tree (Namespace DO). See agents/docs/rbac.md.
  return node.gid === subtreeNodeGid || node.path.includes(subtreeNodeGid);
}

/**
 * Deny-by-default authorization, evaluated identically at the edge and in the DO. See rbac.md.
 */
export function authorize(i: AuthzInput): AuthzDecision {
  const [resource, action] = i.action.split(":");

  // 1. platform scope - administrative resources only; never ambient tenant content (audited by caller).
  if (i.principal.platformRole && PLATFORM_RESOURCES.has(resource)) {
    if (platformCan(i.principal.platformRole, resource, action)) {
      return { allow: true, reason: "platform" };
    }
  }
  // 2. namespace role
  if (i.membership && roleCan(i.membership.role, resource, action)) {
    return { allow: true, reason: "role" };
  }
  // 3. resource grants on an ancestor
  for (const g of i.grants ?? []) {
    if (covers(g.subtreeNodeGid, i.node) && roleCan(g.role, resource, action)) {
      return { allow: true, reason: "grant" };
    }
  }
  // 4. public link (read only)
  if (i.link && i.action === "file:read" && covers(i.link.subtreeNodeGid, i.node)) {
    return { allow: true, reason: "link" };
  }
  return { allow: false, reason: "denied" };
}
