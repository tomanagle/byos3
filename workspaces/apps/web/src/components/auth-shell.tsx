import { Link } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import type { ReactNode } from "react";

/** Branded, centered card used by /sign-in and /sign-up. The body bg (lime-glow grid) shows through. */
export function AuthShell({
  title,
  sub,
  children,
  footer,
}: {
  title: string;
  sub: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="relative grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-9 inline-flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_4px_14px_-4px] shadow-primary/50">
            <Boxes className="size-4" strokeWidth={2.4} />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight">
            byos<span className="text-primary">3</span>
          </span>
        </Link>
        <h1 className="font-display text-[26px] font-semibold tracking-tight text-balance">
          {title}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>
        <div className="mt-7">{children}</div>
        <p className="mt-6 text-sm text-muted-foreground">{footer}</p>
      </div>
    </main>
  );
}
