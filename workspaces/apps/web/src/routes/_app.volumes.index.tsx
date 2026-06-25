import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "#/components/app/app-shell";
import { VolumesScreen } from "#/components/app/volumes-screen";

/** "/volumes" - manage connected buckets. Guarded by the `_app.volumes` layout. See routing.md. */
export const Route = createFileRoute("/_app/volumes/")({ component: VolumesRoute });

function VolumesRoute() {
  const { volumes, activeVolumeId, openConnect, openVolume } = useWorkspace();
  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <VolumesScreen
        volumes={volumes}
        activeId={activeVolumeId}
        onConnect={openConnect}
        onOpen={openVolume}
      />
    </div>
  );
}
