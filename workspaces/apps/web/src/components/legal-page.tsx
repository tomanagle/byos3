import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Simple, public, readable layout for policy pages (terms, privacy). */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link to="/" className="font-display text-lg font-semibold tracking-tight">
          byos<span className="text-primary">3</span>
        </Link>
        <Link to="/" className="text-base text-muted-foreground hover:text-foreground">
          Home
        </Link>
      </header>
      <article className="mx-auto max-w-3xl px-6 pb-20">
        <h1 className="font-display text-4xl font-bold tracking-tight text-balance">{title}</h1>
        <p className="mt-2 text-base text-muted-foreground">Last updated {updated}</p>
        <div className="mt-8 flex flex-col gap-6 text-base leading-relaxed text-foreground/90">
          {children}
        </div>
      </article>
    </main>
  );
}

/** A titled section of a policy page. */
export function Clause({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-display text-xl font-semibold tracking-tight">{heading}</h2>
      {children}
    </section>
  );
}
