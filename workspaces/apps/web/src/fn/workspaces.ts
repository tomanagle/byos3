import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "#/lib/middleware";

/** One workspace (org/namespace) the signed-in user belongs to. */
export interface WorkspaceItem {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface WorkspacesResult {
  /** The user's currently active namespace (what the workspace is showing). */
  activeId: string | null;
  workspaces: WorkspaceItem[];
}

/**
 * The signed-in user's workspaces + which is active. Backed by `listNamespaces` (an INNER JOIN of
 * member → organization), so it never returns dangling memberships - unlike the raw Better Auth
 * client `organization.list()`. `activeId` is the namespace the composition root resolved (it also
 * lazily creates a personal org when the user belongs to none). Drives the rail's org switcher.
 */
export const listWorkspaces = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<WorkspacesResult> => {
    context.span.set({ fn: "listWorkspaces" });
    const workspaces = await context.ctx.memberships.listNamespaces(context.ctx.principal.userId);
    context.span.set({ "workspace.count": workspaces.length });
    return { activeId: context.namespaceId, workspaces };
  });
