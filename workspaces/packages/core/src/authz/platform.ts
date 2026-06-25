import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Platform-level access control (the Better Auth admin plugin). Roles: user (default, no powers),
 * support (read + audited impersonation), admin (full). Platform scope governs *administering the
 * service* - never ambient access to tenant content. See agents/docs/rbac.md.
 */
export const platformStatement = { ...defaultStatements } as const; // user, session

export const platformAc = createAccessControl(platformStatement);

export const platformUser = platformAc.newRole({});

export const support = platformAc.newRole({
  user: ["list", "get", "impersonate"],
  session: ["list"],
});

export const platformAdmin = platformAc.newRole({ ...adminAc.statements });

export const PLATFORM_ROLES = { admin: platformAdmin, support, user: platformUser } as const;
export type PlatformRole = keyof typeof PLATFORM_ROLES;

export function platformCan(role: PlatformRole, resource: string, action: string): boolean {
  const res = PLATFORM_ROLES[role].authorize({ [resource]: [action] } as never);
  return typeof res === "boolean" ? res : res?.success === true;
}
