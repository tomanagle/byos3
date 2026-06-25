import { useMutation } from "@tanstack/react-query";
import { Download, FileCode2, Loader2, X } from "lucide-react";
import type { ReactNode } from "react";
import { downloadUrl } from "#/fn/volumes";
import { isViewableText } from "#/lib/file-types";
import type { ProviderMeta } from "#/lib/providers";
import { cn } from "#/lib/utils";

export interface FileEntry {
  gid: string;
  name: string;
  volumeId: string | null;
  sha256: string | null;
  size: number | null;
  /** the node's current version, used as the base for an edit (addVersion) */
  currentVersionId?: string | null;
}

export function Inspector({
  entry,
  volumeLabel,
  provider,
  onOpen,
  onClose,
}: {
  entry: FileEntry;
  volumeLabel: string;
  provider: ProviderMeta;
  /** open the in-app code viewer/editor (only offered for viewable text files) */
  onOpen?: () => void;
  onClose: () => void;
}) {
  const canView = Boolean(onOpen && isViewableText(entry.name, entry.size));
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
          <p className="mt-0.5 font-mono text-sm text-muted-foreground">in {volumeLabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canView && (
            <button
              type="button"
              onClick={onOpen}
              title="View & edit"
              className="grid size-8 place-items-center rounded-md bg-primary/15 text-primary transition-colors hover:bg-primary/25"
            >
              <FileCode2 className="size-4" strokeWidth={2.2} />
            </button>
          )}
          <IconButton title="Download" onClick={() => dl.mutate()} disabled={dl.isPending}>
            {dl.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
          </IconButton>
          <IconButton title="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
      </div>

      {dl.isError && (
        <p className="px-4 text-xs text-destructive">
          Couldn&apos;t presign - check the connector.
        </p>
      )}

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
          v={<span className="font-mono text-xs">{entry.sha256?.slice(0, 16)}…</span>}
        />
        <Row k="Size" v={<span className="font-mono">{entry.size ?? "-"} bytes</span>} />
        <p className="mt-2 text-sm text-muted-foreground">
          Content-addressed: the file IS its hash. Downloads mint a short-lived presigned GET
          straight from your bucket.
        </p>
      </Section>
    </aside>
  );
}

function IconButton({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-border p-4">
      <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground/70">
        {title}
      </h4>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-base">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v}</span>
    </div>
  );
}
