import type { VolumeSummary } from "@byos3/services";
import { Link } from "@tanstack/react-router";
import { Activity, Boxes, CreditCard, Files, KeyRound, Plus, Users } from "lucide-react";
import { providerFor } from "#/lib/providers";
import { cn } from "#/lib/utils";

export type View = "files" | "volumes" | "keys" | "team";

const NAV: { id: View; label: string; icon: typeof Files }[] = [
  { id: "files", label: "All files", icon: Files },
  { id: "volumes", label: "Volumes", icon: Boxes },
  { id: "keys", label: "API keys", icon: KeyRound },
  { id: "team", label: "Team", icon: Users },
];

export function VolumeRail({
  volumes,
  activeId,
  loading,
  view,
  billingEnabled,
  onView,
  onSelect,
  onConnect,
}: {
  volumes: VolumeSummary[];
  activeId: string | null;
  loading: boolean;
  view: View;
  billingEnabled: boolean;
  onView: (v: View) => void;
  onSelect: (id: string) => void;
  onConnect: () => void;
}) {
  return (
    <aside className="flex w-[264px] shrink-0 flex-col overflow-y-auto border-r border-border bg-card/40">
      <nav className="flex flex-col gap-0.5 p-2.5">
        {NAV.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onView(n.id)}
            className={cn(
              "relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
              view === n.id
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            {view === n.id && (
              <span className="absolute inset-y-1.5 -left-2.5 w-[3px] rounded-r bg-primary" />
            )}
            <n.icon
              className={cn(
                "size-[17px]",
                view === n.id ? "text-primary" : "text-muted-foreground",
              )}
            />
            {n.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onView("keys")}
          className="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <Activity className="size-[17px] text-muted-foreground" />
          Activity
        </button>
      </nav>

      <div className="flex items-center justify-between px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
        <span>Mounted volumes</span>
        <button
          type="button"
          onClick={onConnect}
          title="Connect a bucket"
          className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-primary"
        >
          <Plus className="size-3.5" strokeWidth={2.6} />
        </button>
      </div>

      <div className="flex flex-col gap-0.5 px-2.5">
        {loading && volumes.length === 0 ? (
          <div className="space-y-2 px-2.5 py-2">
            <div className="h-9 animate-pulse rounded-md bg-secondary/70" />
            <div className="h-9 animate-pulse rounded-md bg-secondary/40" />
          </div>
        ) : (
          volumes.map((v) => {
            const p = providerFor(v.provider);
            const isActive = v.id === activeId;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelect(v.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                  isActive
                    ? "border-primary/40 bg-primary/10"
                    : "border-transparent hover:bg-secondary/60",
                )}
              >
                <span className={cn("size-2.5 shrink-0 rounded-full", p.dot)} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-base font-medium">{v.label}</span>
                    <span className="shrink-0 rounded border border-border px-1 font-mono text-xs text-muted-foreground">
                      {p.tag}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground/80">
                    {v.bucket}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={onConnect}
        className="mx-2.5 mt-2.5 flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/45 hover:bg-primary/10 hover:text-primary"
      >
        <Plus className="size-4" strokeWidth={2.4} />
        Connect a bucket
      </button>

      {billingEnabled && (
        <Link
          to="/billing"
          className="mt-auto flex items-center justify-between gap-2 border-t border-border p-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <span className="inline-flex items-center gap-2.5">
            <CreditCard className="size-[17px]" /> Billing
          </span>
          <span className="text-xs">Manage</span>
        </Link>
      )}
    </aside>
  );
}
