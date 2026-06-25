import { createFileRoute } from "@tanstack/react-router";
import { FilesScreen } from "#/components/app/files-screen";
import { Landing } from "#/components/landing";

interface FilesSearch {
  /** current folder node gid in the namespace tree ("root" = top) */
  folder?: string;
  /** selected file node gid (opens the inspector) */
  sel?: string;
}

/**
 * "/" - the home route. Logged in: the default files workspace (first volume active). Logged out:
 * the marketing landing page. The shell ancestor (`_app`) only mounts its chrome when logged in, so
 * the landing renders full-bleed. See routing.md.
 */
export const Route = createFileRoute("/_app/")({
  validateSearch: (s: Record<string, unknown>): FilesSearch => ({
    folder: typeof s.folder === "string" ? s.folder : undefined,
    sel: typeof s.sel === "string" ? s.sel : undefined,
  }),
  component: Home,
});

function Home() {
  const { user } = Route.useRouteContext();
  return user ? <FilesScreen /> : <Landing />;
}
