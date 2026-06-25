import { AppError } from "@byos3/core";
import { isResourceRole, type ResourceRole } from "@byos3/core/authz";
import type { ResourceMember } from "@byos3/core";
import { assertCanVolume } from "./authz";
import type { ServiceContext } from "./context";

function parseRole(role: string): ResourceRole {
  if (!isResourceRole(role)) throw new AppError("invalid_input", `bad role ${role}`);
  return role;
}

/**
 * Invite a user (by email) to a volume with a role, or change their role. Managing members is an
 * admin action → requires `full` on the volume (rbac.md). The invitee must already have an account.
 */
export async function shareVolume(
  ctx: ServiceContext,
  args: { volumeId: string; email: string; role: string },
): Promise<{ userId: string }> {
  await assertCanVolume(ctx, args.volumeId, "share:revoke"); // full-only gate (manage members)
  const role = parseRole(args.role);
  const invitee = await ctx.access.userByEmail(args.email);
  if (!invitee) throw new AppError("not_found", "no user with that email");
  await ctx.access.addVolumeMember(args.volumeId, invitee.id, role);
  return { userId: invitee.id };
}

/** List who has access to a volume (any member may view). */
export async function listVolumeMembers(
  ctx: ServiceContext,
  args: { volumeId: string },
): Promise<ResourceMember[]> {
  await assertCanVolume(ctx, args.volumeId, "file:read");
  return ctx.access.listVolumeMembers(args.volumeId);
}

/** Remove a member from a volume (full-only). */
export async function unshareVolume(
  ctx: ServiceContext,
  args: { volumeId: string; userId: string },
): Promise<void> {
  await assertCanVolume(ctx, args.volumeId, "share:revoke");
  if (args.userId === ctx.principal.userId) {
    throw new AppError("invalid_input", "use a different flow to leave/transfer ownership");
  }
  await ctx.access.removeVolumeMember(args.volumeId, args.userId);
}
