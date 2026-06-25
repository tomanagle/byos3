import type { VolumeSummary } from "@byos3/services";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { createContext, useContext, useMemo, useState } from "react";
import type { Me } from "#/fn/auth";
import { listVolumes } from "#/fn/volumes";
import { ConnectDialog } from "./connect-dialog";
import { Topbar } from "./topbar";
import { TransfersProvider } from "./transfers";
import { VolumeRail, type View } from "./volume-rail";

/**
 * Shared workspace state for the screens rendered inside the shell. The shell owns the volumes
 * query, the active (drop-target) volume, and the Connect dialog; screens read them via
 * `useWorkspace()` rather than re-deriving from the URL.
 */
interface Workspace {
  volumes: VolumeSummary[];
  volumesLoading: boolean;
  /** The active volume = drop target for uploads (URL param on /:id, else the first volume). */
  activeVolumeId: string | null;
  openConnect: () => void;
  openVolume: (id: string) => void;
}

const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within <AppShell>");
  return ctx;
}

/** Map the current path to the rail's active section. */
function viewFor(pathname: string): View {
  if (pathname.startsWith("/volumes")) return "volumes";
  if (pathname.startsWith("/keys")) return "keys";
  return "files";
}

/**
 * The persistent workspace chrome (top bar, volume rail, transfer toasts) wrapping an `<Outlet />`
 * for the active screen. Mounted once by the `_app` layout so the WebSocket and in-flight transfer
 * toasts survive navigation between files / volumes / keys. Navigation is path-based (web-app.md,
 * routing.md): "/" and "/:id" are files, "/volumes" and "/keys" are their own screens.
 */
export function AppShell({ me }: { me: Me }) {
  const volumesQuery = useQuery({ queryKey: ["volumes"], queryFn: () => listVolumes() });
  const volumes = volumesQuery.data ?? [];
  const params = useParams({ strict: false }) as { volumeId?: string };
  const location = useLocation();
  const navigate = useNavigate();
  const [connectOpen, setConnectOpen] = useState(false);

  const activeVolumeId = params.volumeId ?? volumes[0]?.id ?? null;
  const active = volumes.find((v) => v.id === activeVolumeId) ?? null;
  const view = viewFor(location.pathname);

  const openVolume = (id: string) => void navigate({ to: "/$volumeId", params: { volumeId: id } });
  const onView = (v: View) =>
    void navigate({ to: v === "files" ? "/" : v === "volumes" ? "/volumes" : "/keys" });

  const workspace = useMemo<Workspace>(
    () => ({
      volumes,
      volumesLoading: volumesQuery.isLoading,
      activeVolumeId,
      openConnect: () => setConnectOpen(true),
      openVolume,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openVolume is stable via navigate
    [volumes, volumesQuery.isLoading, activeVolumeId],
  );

  return (
    <WorkspaceContext.Provider value={workspace}>
      <TransfersProvider>
        <div className="flex h-screen flex-col bg-background text-foreground">
          <Topbar me={me} active={active} />
          <div className="flex min-h-0 flex-1">
            <VolumeRail
              volumes={volumes}
              activeId={activeVolumeId}
              loading={volumesQuery.isLoading}
              view={view}
              onView={onView}
              onSelect={openVolume}
              onConnect={() => setConnectOpen(true)}
            />
            <main className="flex min-w-0 flex-1 overflow-hidden">
              <Outlet />
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
    </WorkspaceContext.Provider>
  );
}
