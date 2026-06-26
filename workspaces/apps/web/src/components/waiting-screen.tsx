import { Turnstile } from "@marsidev/react-turnstile";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Check, Database, KeyRound, Plug } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { joinWaitlist } from "#/fn/waitlist";

// The PUBLIC Turnstile site key, inlined into the client bundle at build time. In prod CI sets
// VITE_TURNSTILE_SITE_KEY from the Pulumi-provisioned widget; locally it falls back to Cloudflare's
// always-pass test key, so `vite dev` needs no setup. (The matching SECRET is a server-side Worker
// secret used by the waitlist server fn - never shipped to the client.)
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

const SPECS = [
  { icon: Database, label: "Bring your own S3 / R2 / B2" },
  { icon: KeyRound, label: "You hold the keys" },
  { icon: Plug, label: "Open, versioned API" },
];

/**
 * Pre-launch waitlist takeover. Rendered for every route when `SHOW_WAITING_SCREEN` is true
 * (see routes/__root.tsx). Captures interest before the product is open.
 */
export function WaitingScreen() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState("");

  const join = useMutation({
    mutationFn: async (payload: { email: string; name?: string; turnstileToken: string }) => {
      const data = await joinWaitlist({
        data: {
          ...payload,
          referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
        },
      });
      if (!data.ok) throw new Error(data.error ?? "request_failed");
      return data;
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTokenError("");
    if (!token) {
      setTokenError("Please complete the verification below.");
      return;
    }
    join.mutate({ email, name: name.trim() || undefined, turnstileToken: token });
  }

  const done = join.isSuccess;
  const alreadyJoined = join.data?.alreadyJoined === true;

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/70 px-6 py-4 font-mono text-xs tracking-wide text-muted-foreground uppercase">
        <span className="font-semibold text-foreground">byos3</span>
        <span className="hidden items-center gap-2 sm:inline-flex">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          private beta · waitlist open
        </span>
      </div>

      <div className="mx-auto grid max-w-6xl gap-14 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-20 lg:py-28">
        <section className="flex flex-col justify-center">
          <span
            className="byos3-rise inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 font-mono text-xs tracking-wide text-muted-foreground uppercase"
            style={{ animationDelay: "40ms" }}
          >
            <span className="size-1.5 rounded-full bg-primary" />
            bring-your-own storage
          </span>

          <h1
            className="byos3-rise mt-6 font-display text-5xl leading-[0.95] font-extrabold tracking-tight text-balance sm:text-6xl lg:text-7xl"
            style={{ animationDelay: "120ms" }}
          >
            Your files.
            <br />
            Your bucket.
            <br />
            <span className="text-primary">Your rules.</span>
          </h1>

          <p
            className="byos3-rise mt-7 max-w-md text-lg leading-relaxed text-pretty text-muted-foreground"
            style={{ animationDelay: "200ms" }}
          >
            A file sync app that keeps every byte in storage{" "}
            <span className="text-foreground">you</span> own: AWS S3, Cloudflare R2, or Backblaze.
            We run the sync, sharing and API. You pay for the service, never per-gigabyte rent.
          </p>

          <ul className="byos3-rise mt-9 flex flex-col gap-3" style={{ animationDelay: "280ms" }}>
            {SPECS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-sm text-foreground/90">
                <span className="flex size-7 items-center justify-center rounded-md border border-border bg-card/60 text-primary">
                  <Icon className="size-3.5" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex items-center">
          <div
            className="byos3-rise w-full rounded-2xl border border-border bg-card/70 p-7 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-9"
            style={{ animationDelay: "360ms" }}
          >
            {done ? (
              <div className="flex flex-col items-start gap-4 py-4">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="size-5" strokeWidth={2.5} />
                </span>
                <h2 className="font-display text-2xl font-bold">
                  {alreadyJoined ? "Already on the list" : "You're on the list"}
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Thanks for your interest. We'll email{" "}
                  <span className="font-mono text-foreground">{email}</span> the moment byos3 is
                  ready.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <h2 className="font-display text-xl font-bold">Join the waitlist</h2>
                  <p className="text-sm text-muted-foreground">
                    Be first to connect your own bucket.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Name (optional)</Label>
                  <Input
                    id="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Ada Lovelace"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <Turnstile
                  siteKey={TURNSTILE_SITE_KEY}
                  options={{ theme: "dark" }}
                  onSuccess={(t) => {
                    setToken(t);
                    setTokenError("");
                  }}
                  onExpire={() => setToken("")}
                  onError={() => setToken("")}
                />

                <Button type="submit" size="lg" disabled={join.isPending}>
                  {join.isPending ? "Joining…" : "Join the waitlist"}
                  {!join.isPending && <ArrowRight className="size-4" />}
                </Button>

                {(tokenError || join.isError) && (
                  <p className="text-sm text-destructive" role="alert">
                    {tokenError ||
                      (join.error instanceof Error && join.error.message === "invalid_input"
                        ? "Please enter a valid email address."
                        : "Something went wrong. Please try again.")}
                  </p>
                )}

                <p className="font-mono text-xs leading-relaxed text-muted-foreground/80">
                  We'll only email you about the byos3 launch.
                </p>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
