import type { VolumeSummary } from "@byos3/services";
import { Link, useNavigate } from "@tanstack/react-router";
import { Boxes, LogOut } from "lucide-react";
import type { Me } from "#/fn/auth";
import { authClient } from "#/lib/auth-client";
import { providerFor } from "#/lib/providers";
import { cn } from "#/lib/utils";

export function Topbar({ me, active }: { me: Me; active: VolumeSummary | null }) {
  const navigate = useNavigate();
  const p = providerFor(active?.provider);

  async function signOut() {
    await authClient.signOut();
    await navigate({ to: "/sign-in" });
  }

  const initials = (me.name || me.email).slice(0, 2).toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3.5 border-b border-border bg-card/70 px-4 backdrop-blur-md">
      <Link
        to="/"
        aria-label="Go to all files"
        className="flex items-center gap-2.5 rounded-lg pr-1 transition-opacity hover:opacity-80"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_4px_14px_-4px] shadow-primary/50">
          <Boxes className="size-4" strokeWidth={2.4} />
        </span>
        <span className="font-display text-[15px] font-semibold tracking-tight">
          byos<span className="text-primary">3</span>
        </span>
      </Link>

      {active && (
        <div className="hidden items-center gap-2 text-sm sm:flex">
          <span className="text-muted-foreground">/</span>
          <span className={cn("size-2 rounded-full", p.dot)} />
          <span className="font-medium">{active.label}</span>
        </div>
      )}

      <div className="flex-1" />

      {active && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5">
          <span className="hidden text-xs text-muted-foreground md:inline">Dropping into</span>
          <span className={cn("size-2 rounded-full", p.dot)} />
          <span className="text-sm font-medium">{active.label}</span>
        </div>
      )}

      <button
        type="button"
        onClick={signOut}
        title="Sign out"
        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <LogOut className="size-4" />
      </button>
      <div className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-slate-500 to-slate-800 text-[11px] font-semibold text-white">
        {initials}
      </div>
    </header>
  );
}
