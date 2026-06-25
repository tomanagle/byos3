import { useMutation } from "@tanstack/react-query";
import { Download, Loader2, X } from "lucide-react";
import type { ReactNode } from "react";
import { downloadUrl } from "#/fn/volumes";
import type { ProviderMeta } from "#/lib/providers";
import { cn } from "#/lib/utils";

export interface FileEntry {
  gid: string;
  name: string;
  volumeId: string | null;
  sha256: string | null;
  size: number | null;
}

export function Inspector({
  entry,
  volumeLabel,
  provider,
  onClose,
}: {
  entry: FileEntry;
  volumeLabel: string;
  provider: ProviderMeta;
  onClose: () => void;
}) {
  const dl = useMutation({
    mutationFn: () => {
      if (!entry.volumeId || !entry.sha256) throw new Error("no content");
      return downloadUrl({ data: { volumeId: entry.volumeId, hash: entry.sha256 } });
    },
    onSuccess: (presigned) => {
      if (typeof window !== "undefined") window.open(presigned.url, "_blank", "noopener");
    },
  });

  return (
    <aside className="flex w-[340px] shrink-0 flex-col overflow-y-auto border-l border-border bg-card/40">
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold break-words">{entry.name}</h3>
          <p className="mt-0.5 font-mono text-[12px] text-muted-foreground">in {volumeLabel}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="px-4">
        <button
          type="button"
          onClick={() => dl.mutate()}
          disabled={dl.isPending}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
        >
          {dl.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" strokeWidth={2.2} />
          )}
          Download
        </button>
        {dl.isError && (
          <p className="mt-2 text-xs text-destructive">
            Couldn&apos;t presign - check the connector.
          </p>
        )}
      </div>

      <Section title="Location">
        <Row
          k="Volume"
          v={
            <span className="inline-flex items-center gap-2">
              <span className={cn("size-2 rounded-full", provider.dot)} />
              {volumeLabel}
            </span>
          }
        />
        <Row k="Provider" v={provider.label} />
      </Section>

      <Section title="Integrity">
        <Row
          k="SHA-256"
          v={<span className="font-mono text-[11px]">{entry.sha256?.slice(0, 16)}…</span>}
        />
        <Row k="Size" v={<span className="font-mono">{entry.size ?? "-"} bytes</span>} />
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          Content-addressed: the file IS its hash. Downloads mint a short-lived presigned GET
          straight from your bucket.
        </p>
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-border p-4">
      <h4 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/70">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-[13px]">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
