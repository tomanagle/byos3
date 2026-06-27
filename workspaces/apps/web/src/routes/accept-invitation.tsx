import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { authClient } from "#/lib/auth-client";

/** "/accept-invitation?id=..." - the invitee joins an org. Needs a signed-in session. See billing.md. */
export const Route = createFileRoute("/accept-invitation")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : "",
  }),
  component: AcceptInvitation,
});

function AcceptInvitation() {
  const { id } = Route.useSearch();
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();

  const accept = useMutation({
    mutationFn: async () => {
      const r = await authClient.organization.acceptInvitation({ invitationId: id });
      if (r.error) throw new Error(r.error.message ?? "Couldn't accept the invitation.");
    },
    onSuccess: () => void navigate({ to: "/" }),
  });

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <Link to="/" className="font-display text-lg font-semibold tracking-tight">
          byos<span className="text-primary">3</span>
        </Link>

        {!id ? (
          <p className="mt-6 text-base text-muted-foreground">
            This invitation link is missing its id. Ask whoever invited you to resend it.
          </p>
        ) : isPending ? (
          <div className="mt-6 flex justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !session?.user ? (
          <>
            <h1 className="mt-6 font-display text-xl font-semibold tracking-tight">
              You&apos;ve been invited
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Sign in or create an account with the invited email - you&apos;ll come right back here
              to join.
            </p>
            <div className="mt-5 flex justify-center gap-2.5">
              <Link
                to="/sign-in"
                search={{ redirect: "accept", invite: id }}
                className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-base font-semibold text-primary-foreground hover:brightness-110"
              >
                Sign in
              </Link>
              <Link
                to="/sign-up"
                search={{ redirect: "accept", invite: id }}
                className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-base font-medium hover:bg-accent"
              >
                Create account
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-6 font-display text-xl font-semibold tracking-tight">
              Join this workspace
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Accept the invitation to share volumes with your team.
            </p>
            <button
              type="button"
              onClick={() => accept.mutate()}
              disabled={accept.isPending}
              className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-base font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
            >
              {accept.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Accept invitation
            </button>
            {accept.isError && (
              <p className="mt-3 text-sm text-destructive">{accept.error.message}</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
