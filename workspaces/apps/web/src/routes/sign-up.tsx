import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { AuthShell } from "#/components/auth-shell";
import { GithubButton } from "#/components/github-button";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { authClient } from "#/lib/auth-client";

// `redirect=accept` + `invite=<id>` carry a pending invitation through signup so the new user lands
// back on /accept-invitation and joins that org (no redundant personal one). See accept-invitation.tsx.
export const Route = createFileRoute("/sign-up")({
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
    invite: typeof s.invite === "string" ? s.invite : undefined,
  }),
  component: SignUp,
});

function SignUp() {
  const navigate = useNavigate();
  const { redirect, invite } = Route.useSearch();
  const [name, setName] = useState("");
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
    const res = await authClient.signUp.email({ name, email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? "Couldn't create your account.");
      return;
    }
    await afterAuth();
  }

  return (
    <AuthShell
      title="Create your workspace"
      sub="Connect a bucket you own and start in minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/sign-in"
            search={{ redirect, invite }}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <GithubButton callbackURL={callbackURL} />
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ada Lovelace"
          />
        </div>
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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={loading} className="mt-1">
          {loading && <Loader2 className="size-4 animate-spin" />}
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
