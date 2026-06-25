import { createFileRoute, redirect } from "@tanstack/react-router";
import { Workspace } from "#/components/app/workspace";
import { getMe } from "#/fn/auth";

/**
 * The workspace's full navigation state lives in the URL so it's deep-linkable: copy the address,
 * paste it in another tab, and land on the exact same volume + path (+ selected file). See web-app.md.
 */
export interface AppSearch {
  /** active volume id = the drop target for new uploads */
  v?: string;
  /** current folder node gid in the namespace tree ("root" = top) */
  folder?: string;
  /** which screen: files (default), volumes, or keys */
  view?: "volumes" | "keys";
  /** selected file node gid (opens the inspector) */
  sel?: string;
}

export const Route = createFileRoute("/app")({
  // Server-side guard: resolve the session before rendering; bounce to /sign-in when signed out.
  beforeLoad: async () => {
    const me = await getMe();
    if (!me) throw redirect({ to: "/sign-in" });
    return { me };
  },
  loader: ({ context }) => ({ me: context.me }),
  validateSearch: (search: Record<string, unknown>): AppSearch => ({
    v: typeof search.v === "string" ? search.v : undefined,
    folder: typeof search.folder === "string" ? search.folder : undefined,
    view: search.view === "volumes" || search.view === "keys" ? search.view : undefined,
    sel: typeof search.sel === "string" ? search.sel : undefined,
  }),
  component: AppRoute,
});

function AppRoute() {
  const { me } = Route.useLoaderData();
  return <Workspace me={me} />;
}
