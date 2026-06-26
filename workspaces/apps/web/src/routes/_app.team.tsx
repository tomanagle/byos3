import { createFileRoute, redirect } from "@tanstack/react-router";
import { TeamScreen } from "#/components/app/team-screen";
import { SHOW_WAITING_SCREEN } from "#/lib/flags";

/** "/team" - invite + manage org members (seat-gated). Protected. See routing.md, billing.md. */
export const Route = createFileRoute("/_app/team")({
  beforeLoad: ({ context }) => {
    if (!SHOW_WAITING_SCREEN && !context.user) throw redirect({ to: "/sign-in" });
  },
  component: TeamRoute,
});

function TeamRoute() {
  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <TeamScreen />
    </div>
  );
}
