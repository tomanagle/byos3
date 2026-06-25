import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { SHOW_WAITING_SCREEN } from "#/lib/flags";

/**
 * Layout for the `/volumes` subtree (the manager at `/volumes` and a volume's files at
 * `/volumes/:id`). Guards the whole subtree; renders into the shell's outlet. See routing.md.
 */
export const Route = createFileRoute("/_app/volumes")({
  beforeLoad: ({ context }) => {
    if (!SHOW_WAITING_SCREEN && !context.user) throw redirect({ to: "/sign-in" });
  },
  component: Outlet,
});
