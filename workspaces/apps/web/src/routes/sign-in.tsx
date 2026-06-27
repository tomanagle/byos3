import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AuthShell } from "#/components/auth-shell";
import { GithubButton } from "#/components/github-button";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient } from "#/lib/auth-client";

// `redirect=accept` + `invite=<id>` round-trips a pending invitation through auth, so a new user who
// opened an invite link lands back on /accept-invitation (and joins that org) instead of the
// workspace - which would otherwise lazily create a redundant personal org. See accept-invitation.tsx.
export const Route = createFileRoute("/sign-in")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
    invite: typeof s.invite === "string" ? s.invite : undefined,
  }),
  component: SignIn,
});

function SignIn() {
  const navigate = useNavigate();
  const { redirect, invite } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const afterAuth = () =>
    redirect === "accept" && invite
      ? navigate({ to: "/accept-invitation", search: { id: invite } })
      : navigate({ to: "/" });
  const callbackURL = redirect === "accept" && invite ? `/accept-invitation?id=${invite}` : "/";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await authClient.signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? "Couldn't sign in. Check your email and password.");
      return;
    }
    await afterAuth();
  }

  return (
    <AuthShell
      title="Welcome back"
      sub="Sign in to your storage workspace."
      footer={
        <>
          New here?{" "}
          <Link
            to="/sign-up"
            search={{ redirect, invite }}
            className="font-medium text-primary hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <GithubButton callbackURL={callbackURL} />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading} className="mt-1">
          {loading && <Loader2 className="size-4 animate-spin" />}
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
