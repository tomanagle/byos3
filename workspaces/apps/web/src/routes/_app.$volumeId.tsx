import { createFileRoute, redirect } from "@tanstack/react-router";
import { FilesScreen } from "#/components/app/files-screen";
import { SHOW_WAITING_SCREEN } from "#/lib/flags";

interface FilesSearch {
  folder?: string;
  sel?: string;
}

/**
 * "/:id" - the files workspace with a specific volume as the active upload target. Same canvas as
 * "/", just a different drop volume (resolved from the param by the shell). Protected: logged-out
 * visitors are sent to sign-in. See routing.md.
 */
export const Route = createFileRoute("/_app/$volumeId")({
  beforeLoad: ({ context }) => {
    if (!SHOW_WAITING_SCREEN && !context.user) throw redirect({ to: "/sign-in" });
  },
  validateSearch: (s: Record<string, unknown>): FilesSearch => ({
    folder: typeof s.folder === "string" ? s.folder : undefined,
    sel: typeof s.sel === "string" ? s.sel : undefined,
  }),
  component: FilesScreen,
});
