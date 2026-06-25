import { ac } from "./policy";

/**
 * Resource-level roles for sharing a specific connector/volume (rbac.md). A user holds one of these
 * on a resource (owner is seeded as `full`); access is decided by the resource role, independent of
 * namespace membership. Built from the same AC statement vocabulary as the namespace roles so one
 * permission model governs everything.
 *
 * - `read_only`  - list + read + download (reader-equivalent)
 * - `read_write` - read_only + create/update/delete/restore files + create shares (writer-equivalent)
 * - `full`       - read_write + manage the resource itself: update/delete it, revoke/list shares
 *                  (i.e. the admin actions the user described)
 */
export const RESOURCE_ROLES = ["full", "read_write", "read_only"] as const;
export type ResourceRole = (typeof RESOURCE_ROLES)[number];

const RESOURCE_ROLE_AC = {
  read_only: ac.newRole({ file: ["read"], volume: ["list"], ai: ["query"] }),
  read_write: ac.newRole({
    file: ["read", "create", "update", "delete", "restore"],
    volume: ["list"],
    share: ["create"],
    ai: ["query"],
  }),
  full: ac.newRole({
    volume: ["unmount", "update", "delete", "list"],
    file: ["read", "create", "update", "delete", "restore"],
    share: ["create", "revoke", "list"],
    ai: ["query", "configure"],
  }),
} as const;

export function isResourceRole(v: unknown): v is ResourceRole {
  return typeof v === "string" && (RESOURCE_ROLES as readonly string[]).includes(v);
}

/** Offline check: may a holder of `role` on a resource perform `resource:action`? */
export function resourceCan(role: ResourceRole, resource: string, action: string): boolean {
  const res = RESOURCE_ROLE_AC[role].authorize({ [resource]: [action] } as never);
  return typeof res === "boolean" ? res : res?.success === true;
}
