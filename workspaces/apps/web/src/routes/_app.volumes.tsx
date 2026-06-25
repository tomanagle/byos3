import { createFileRoute, redirect } from "@tanstack/react-router";
import { useWorkspace } from "#/components/app/app-shell";
import { VolumesScreen } from "#/components/app/volumes-screen";
import { SHOW_WAITING_SCREEN } from "#/lib/flags";

/** "/volumes" - manage connected buckets. Protected. See routing.md. */
export const Route = createFileRoute("/_app/volumes")({
  beforeLoad: ({ context }) => {
    if (!SHOW_WAITING_SCREEN && !context.user) throw redirect({ to: "/sign-in" });
  },
  component: VolumesRoute,
});

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
