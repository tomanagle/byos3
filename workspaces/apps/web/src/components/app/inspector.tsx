import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileCode2, Loader2, X } from "lucide-react";
import type { ReactNode } from "react";
import { downloadUrl } from "#/fn/volumes";
import { isImage, isViewableText } from "#/lib/file-types";
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

      <Preview entry={entry} />

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

/** Inline preview: an image thumbnail, or the first lines of a text/code file. Nothing otherwise. */
function Preview({ entry }: { entry: FileEntry }) {
  if (!entry.volumeId || !entry.sha256) return null;
  if (isImage(entry.name)) {
    return <ImagePreview volumeId={entry.volumeId} sha256={entry.sha256} alt={entry.name} />;
  }
  if (isViewableText(entry.name, entry.size)) {
    return <TextPreview volumeId={entry.volumeId} sha256={entry.sha256} />;
  }
  return null;
}

function ImagePreview({
  volumeId,
  sha256,
  alt,
}: {
  volumeId: string;
  sha256: string;
  alt: string;
}) {
  const q = useQuery({
    queryKey: ["preview-url", volumeId, sha256],
    queryFn: () => downloadUrl({ data: { volumeId, hash: sha256 } }),
    staleTime: 240_000, // shorter than the 300s presign TTL
  });
  return (
    <Section title="Preview">
      {q.data ? (
        <img
          src={q.data.url}
          alt={alt}
          className="max-h-56 w-full rounded-md border border-border bg-background/50 object-contain"
        />
      ) : (
        <div className="grid h-32 place-items-center rounded-md border border-border bg-background/40">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </Section>
  );
}

function TextPreview({ volumeId, sha256 }: { volumeId: string; sha256: string }) {
  const q = useQuery({
    queryKey: ["file-content", volumeId, sha256], // shared with the full editor's fetch
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const { url } = await downloadUrl({ data: { volumeId, hash: sha256 } });
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      return res.text();
    },
  });
  return (
    <Section title="Preview">
      {q.isLoading ? (
        <div className="h-24 animate-pulse rounded-md bg-secondary/50" />
      ) : q.isError ? (
        <p className="text-sm text-muted-foreground">Preview unavailable.</p>
      ) : (
        <pre className="max-h-64 overflow-auto rounded-md border border-border bg-background/50 p-2.5 font-mono text-sm leading-relaxed whitespace-pre text-foreground/90">
          {truncate(q.data ?? "")}
        </pre>
      )}
    </Section>
  );
}

function truncate(s: string, max = 4000): string {
  return s.length > max ? `${s.slice(0, max)}\n…` : s;
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
