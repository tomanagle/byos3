import type { VolumeSummary } from "@byos3/services";
import { Plus, ShieldCheck } from "lucide-react";
import { providerFor } from "#/lib/providers";
import { cn } from "#/lib/utils";

export function VolumesScreen({
  volumes,
  activeId,
  onConnect,
  onOpen,
}: {
  volumes: VolumeSummary[];
  activeId: string | null;
  onConnect: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">Volumes</h1>
          <p className="mt-1 text-base text-muted-foreground">
            Buckets you own, mounted as drives. byos3 holds only encrypted credentials.
          </p>
        </div>
        <button
          type="button"
          onClick={onConnect}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:brightness-110"
        >
          <Plus className="size-4" strokeWidth={2.4} /> Connect a bucket
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {volumes.map((v) => {
          const p = providerFor(v.provider);
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onOpen(v.id)}
              className="relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-border/80 hover:shadow-lg"
            >
              <span className={cn("absolute inset-x-0 top-0 h-[3px]", p.dot)} />
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-10 place-items-center rounded-xl font-mono text-sm font-extrabold text-white",
                    p.dot,
                  )}
                >
                  {p.tag}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{v.label}</div>
                  <div className="truncate font-mono text-sm text-muted-foreground">{v.bucket}</div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/15 px-2 py-0.5 text-xs text-ok">
                  <ShieldCheck className="size-3" /> Connected
                </span>
                {v.id === activeId && (
                  <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    Drop target
                  </span>
                )}
                <span className="ml-auto font-mono text-xs text-muted-foreground/80">
                  {p.label}
                </span>
              </div>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onConnect}
          className="grid min-h-[124px] place-items-center rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-primary/45 hover:bg-primary/10 hover:text-primary"
        >
          <span className="flex flex-col items-center gap-1.5">
            <Plus className="size-5" />
            <span className="text-sm font-medium">Connect a bucket</span>
          </span>
        </button>
      </div>
    </div>
  );
}
