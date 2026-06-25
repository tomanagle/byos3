import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Boxes, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { Me } from "#/fn/auth";
import { listVolumes } from "#/fn/volumes";
import { ConnectDialog } from "./connect-dialog";
import { FileCanvas } from "./file-canvas";
import { KeysScreen } from "./keys-screen";
import { Topbar } from "./topbar";
import { TransfersProvider } from "./transfers";
import { VolumeRail } from "./volume-rail";
import { VolumesScreen } from "./volumes-screen";

// Navigation state lives in the URL (see routes/app.tsx `AppSearch`) so the workspace is
// deep-linkable: same volume + path + selected file in any tab. `getRouteApi` avoids a circular
// import with the route module.
const route = getRouteApi("/app");

export function Workspace({ me }: { me: Me }) {
  const volumesQuery = useQuery({ queryKey: ["volumes"], queryFn: () => listVolumes() });
  const volumes = volumesQuery.data ?? [];
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const [connectOpen, setConnectOpen] = useState(false);

  const firstVolumeId = volumes[0]?.id;
  const dropVolumeId = search.v ?? firstVolumeId ?? null;
  const view = search.view ?? "files";
  const folderGid = search.folder ?? "root";
  const selectedGid = search.sel ?? null;
  const active = volumes.find((v) => v.id === dropVolumeId) ?? null;

  // Once volumes load, pin the drop-target volume into the URL so a refresh or shared link keeps it.
  useEffect(() => {
    if (!search.v && firstVolumeId) {
      void navigate({ search: (p) => ({ ...p, v: firstVolumeId }), replace: true });
    }
  }, [search.v, firstVolumeId, navigate]);

  function openVolume(id: string) {
    void navigate({ search: (p) => ({ ...p, v: id, view: undefined }) }); // set drop target, go to files
  }
  function setView(v: "files" | "volumes" | "keys") {
    void navigate({
      search: (p) => ({ ...p, view: v === "files" ? undefined : v, sel: undefined }),
    });
  }
  function setSelectedGid(gid: string | null) {
    void navigate({ search: (p) => ({ ...p, sel: gid ?? undefined }) });
  }
  function navigateFolder(gid: string) {
    void navigate({
      search: (p) => ({ ...p, folder: gid === "root" ? undefined : gid, sel: undefined }),
    });
  }

  return (
    <TransfersProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <Topbar me={me} active={active} />
        <div className="flex min-h-0 flex-1">
          <VolumeRail
            volumes={volumes}
            activeId={dropVolumeId}
            loading={volumesQuery.isLoading}
            view={view}
            onView={setView}
            onSelect={openVolume}
            onConnect={() => setConnectOpen(true)}
          />

          <main className="flex min-w-0 flex-1 overflow-hidden">
            {view === "files" &&
              (volumes.length > 0 ? (
                <FileCanvas
                  volumes={volumes}
                  dropVolumeId={dropVolumeId}
                  folderGid={folderGid}
                  onNavigateFolder={navigateFolder}
                  selectedGid={selectedGid}
                  onSelectGid={setSelectedGid}
                />
              ) : (
                <NoVolumes
                  loading={volumesQuery.isLoading}
                  onConnect={() => setConnectOpen(true)}
                />
              ))}
            {view === "volumes" && (
              <div className="min-w-0 flex-1 overflow-y-auto">
                <VolumesScreen
                  volumes={volumes}
                  activeId={dropVolumeId}
                  onConnect={() => setConnectOpen(true)}
                  onOpen={openVolume}
                />
              </div>
            )}
            {view === "keys" && (
              <div className="min-w-0 flex-1 overflow-y-auto">
                <KeysScreen />
              </div>
            )}
          </main>
        </div>

        <ConnectDialog
          open={connectOpen}
          onClose={() => setConnectOpen(false)}
          onConnected={(id) => {
            void volumesQuery.refetch();
            openVolume(id);
          }}
        />
      </div>
    </TransfersProvider>
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
