import { createFileRoute } from "@tanstack/react-router";
import { FilesScreen } from "#/components/app/files-screen";

interface FilesSearch {
  folder?: string;
  sel?: string;
}

/**
 * "/volumes/:id" - the files workspace with a specific volume as the active upload target. Same
 * canvas as "/", just a different drop volume (resolved from the param by the shell). Guarded by the
 * `_app.volumes` layout. See routing.md.
 */
export const Route = createFileRoute("/_app/volumes/$volumeId")({
  validateSearch: (s: Record<string, unknown>): FilesSearch => ({
    folder: typeof s.folder === "string" ? s.folder : undefined,
    sel: typeof s.sel === "string" ? s.sel : undefined,
  }),
  component: FilesScreen,
});
