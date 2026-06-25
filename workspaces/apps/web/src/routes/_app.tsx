import { Outlet, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "#/components/app/app-shell";

/**
 * Pathless layout for the workspace. When logged in it mounts the persistent shell (rail, top bar,
 * transfers) once and renders the active screen into its `<Outlet />`; when logged out it renders a
 * bare `<Outlet />` so "/" can show the landing page and protected children redirect to sign-in.
 * See routing.md.
 */
export const Route = createFileRoute("/_app")({ component: AppLayout });

function AppLayout() {
  const { user } = Route.useRouteContext();
  if (!user) return <Outlet />;
  return <AppShell me={user} />;
}
