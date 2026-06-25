import { Link } from "@tanstack/react-router";
import { ArrowRight, GitBranch, KeyRound, Share2, Zap } from "lucide-react";
import { PROVIDERS } from "#/lib/providers";
import { cn } from "#/lib/utils";

const FEATURES = [
  {
    icon: KeyRound,
    title: "Bring your own bucket",
    body: "Mount an S3, R2, B2, Wasabi, or MinIO bucket you already own. We store only the encrypted credentials, never your files.",
  },
  {
    icon: Zap,
    title: "Direct, fast transfers",
    body: "Files move straight between your device and your bucket over short-lived presigned URLs. No middle hop, no per-gigabyte rent.",
  },
  {
    icon: Share2,
    title: "Live sync and sharing",
    body: "A single-writer journal keeps every window and device in step in real time. Share a volume with a teammate by email.",
  },
  {
    icon: GitBranch,
    title: "Open, versioned API",
    body: "Anything the app can do, an API key can do. Content-addressed blocks, cursor sync, and a documented HTTP surface.",
  },
];

export function Landing() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[680px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]"
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-display text-lg font-semibold tracking-tight">
          byos<span className="text-primary">3</span>
        </span>
        <nav className="flex items-center gap-2">
          <Link
            to="/sign-in"
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Link
            to="/sign-up"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-[0_6px_18px_-6px] shadow-primary/50 transition hover:brightness-110"
          >
            Get started <ArrowRight className="size-3.5" strokeWidth={2.4} />
          </Link>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pt-16 pb-20 text-center lg:pt-24">
        <h1
          className="byos3-rise mx-auto mt-6 max-w-3xl font-display text-5xl leading-[0.95] font-extrabold tracking-tight text-balance sm:text-6xl lg:text-7xl"
          style={{ animationDelay: "120ms" }}
        >
          Your files. Your bucket. <span className="text-primary">Your rules.</span>
        </h1>

        <p
          className="byos3-rise mx-auto mt-7 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground"
          style={{ animationDelay: "200ms" }}
        >
          A file workspace that keeps every byte in storage you own. byos3 runs the sync, sharing
          and API; you keep the bucket and pay for the service, never per-gigabyte rent.
        </p>

        <div
          className="byos3-rise mt-9 flex flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "280ms" }}
        >
          <Link
            to="/sign-up"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_8px_22px_-8px] shadow-primary/60 transition hover:brightness-110"
          >
            Connect your first bucket <ArrowRight className="size-4" strokeWidth={2.4} />
          </Link>
          <Link
            to="/sign-in"
            className="inline-flex h-11 items-center rounded-xl border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Sign in
          </Link>
        </div>

        {/* provider strip: color carries which cloud */}
        <div
          className="byos3-rise mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
          style={{ animationDelay: "360ms" }}
        >
          {PROVIDERS.filter((p) => p.id !== "custom").map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span className={cn("size-2.5 rounded-full", p.dot)} />
              {p.label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-border bg-card/50 p-6 transition-colors hover:border-primary/30"
            >
              <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
                <Icon className="size-5" strokeWidth={2} />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-1.5 text-base leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>

        {/* closing CTA */}
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-primary/25 bg-primary/[0.07] px-6 py-12 text-center">
          <h2 className="max-w-xl font-display text-3xl font-bold tracking-tight text-balance">
            Keep your data. Lose the lock-in.
          </h2>
          <Link
            to="/sign-up"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-[0_8px_22px_-8px] shadow-primary/60 transition hover:brightness-110"
          >
            Get started <ArrowRight className="size-4" strokeWidth={2.4} />
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/70">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 font-mono text-xs tracking-wide text-muted-foreground uppercase">
          <span className="font-semibold text-foreground">byos3</span>
          <span>your files, your bucket, your policies</span>
        </div>
      </footer>
    </main>
  );
}
