import { createFileRoute, redirect } from "@tanstack/react-router";
import { BillingScreen } from "#/components/app/billing-screen";
import { SHOW_WAITING_SCREEN } from "#/lib/flags";

/** "/billing" - plan + per-seat upgrade flow (Stripe). Protected. See billing.md, routing.md. */
export const Route = createFileRoute("/_app/billing")({
  beforeLoad: ({ context }) => {
    if (!SHOW_WAITING_SCREEN && !context.user) throw redirect({ to: "/sign-in" });
  },
  component: BillingRoute,
});

function BillingRoute() {
  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <BillingScreen />
    </div>
  );
}
