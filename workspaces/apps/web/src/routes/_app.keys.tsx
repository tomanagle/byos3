import { createFileRoute, redirect } from "@tanstack/react-router";
import { KeysScreen } from "#/components/app/keys-screen";
import { SHOW_WAITING_SCREEN } from "#/lib/flags";

/** "/keys" - mint and manage scoped API keys. Protected. See routing.md. */
export const Route = createFileRoute("/_app/keys")({
  beforeLoad: ({ context }) => {
    if (!SHOW_WAITING_SCREEN && !context.user) throw redirect({ to: "/sign-in" });
  },
  component: KeysRoute,
});

function KeysRoute() {
  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <KeysScreen />
    </div>
  );
}
