import { useNavigate, useSearch } from "@tanstack/react-router";
import { Boxes, Plus } from "lucide-react";
import { FileCanvas } from "./file-canvas";
import { useWorkspace } from "./app-shell";

/**
 * The default workspace screen: the namespace tree (folders + files across volumes) with the active
 * volume as the upload drop target. Folder + selection live in the URL search (`?folder=&sel=`) so a
 * link reopens the exact path + selected file. Shared by "/" (first volume active) and "/:id"
 * (that volume active) - the active volume comes from the shell. See routing.md, web-app.md.
 */
export function FilesScreen() {
  const { volumes, volumesLoading, activeVolumeId, openConnect } = useWorkspace();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { folder?: string; sel?: string };
  const folderGid = search.folder ?? "root";
  const selectedGid = search.sel ?? null;

  if (volumes.length === 0) return <NoVolumes loading={volumesLoading} onConnect={openConnect} />;

  return (
    <FileCanvas
      volumes={volumes}
      dropVolumeId={activeVolumeId}
      folderGid={folderGid}
      onNavigateFolder={(gid) =>
        void navigate({
          to: ".",
          search: (p) => ({ ...p, folder: gid === "root" ? undefined : gid, sel: undefined }),
        })
      }
      selectedGid={selectedGid}
      onSelectGid={(gid) =>
        void navigate({ to: ".", search: (p) => ({ ...p, sel: gid ?? undefined }) })
      }
    />
  );
}

function NoVolumes({ loading, onConnect }: { loading: boolean; onConnect: () => void }) {
  if (loading) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="size-6 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }
  return (
    <div className="grid flex-1 place-items-center px-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Boxes className="size-7" />
        </div>
        <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-balance">
          Connect your first bucket
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Mount an S3, R2, B2, Wasabi, or MinIO bucket you already own.
        </p>
        <button
          type="button"
          onClick={onConnect}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[0_6px_18px_-6px] shadow-primary/50 hover:brightness-110"
        >
          <Plus className="size-4" strokeWidth={2.4} /> Connect a bucket
        </button>
      </div>
    </div>
  );
}
