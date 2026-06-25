import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/organization/access";

/**
 * The single source of truth for namespace authorization. Defined once here and consumed by both
 * Better Auth's organization plugin AND our offline `roleCan`/`authorize()`. See agents/docs/rbac.md.
 *
 * `defaultStatements` provides `organization`, `member`, `invitation`; we add our domain resources.
 */
export const statement = {
  ...defaultStatements,
  volume: ["mount", "unmount", "update", "list", "delete"],
  file: ["read", "create", "update", "delete", "restore"],
  share: ["create", "revoke", "list"],
  ai: ["query", "configure"],
  billing: ["view", "manage"],
} as const;

export const ac = createAccessControl(statement);

export const reader = ac.newRole({
  file: ["read"],
  ai: ["query"],
  volume: ["list"],
});

export const writer = ac.newRole({
  file: ["read", "create", "update", "delete", "restore"],
  share: ["create"],
  ai: ["query"],
  volume: ["list"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  volume: ["mount", "unmount", "update", "list", "delete"],
  file: ["read", "create", "update", "delete", "restore"],
  share: ["create", "revoke", "list"],
  ai: ["query", "configure"],
  billing: ["view"],
});

export const owner = ac.newRole({
  ...adminAc.statements,
  organization: ["update", "delete"],
  volume: ["mount", "unmount", "update", "list", "delete"],
  file: ["read", "create", "update", "delete", "restore"],
  share: ["create", "revoke", "list"],
  ai: ["query", "configure"],
  billing: ["view", "manage"],
});

export const NAMESPACE_ROLES = { owner, admin, writer, reader } as const;
export type Role = keyof typeof NAMESPACE_ROLES;

/** Offline permission check used at the edge and in the DO. Robust to the role.authorize() shape. */
export function roleCan(role: Role, resource: string, action: string): boolean {
  const res = NAMESPACE_ROLES[role].authorize({ [resource]: [action] } as never);
  return typeof res === "boolean" ? res : res?.success === true;
}
