import type { VolumeSummary } from "@byos3/services";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpFromLine, Check, ShieldCheck, TriangleAlert, X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { treeCommit, treeCommitIntent } from "#/fn/tree";
import { uploadIntent } from "#/fn/volumes";
import { providerFor } from "#/lib/providers";
import { cn } from "#/lib/utils";

/** SHA-256 of a file as lowercase hex - the content address (Phase 1 chunker = whole file). */
async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type FileStatus = "uploading" | "done" | "error";
interface TFile {
  id: string;
  name: string;
  progress: number;
  status: FileStatus;
}
interface TransferState {
  volumeLabel: string;
  dot: string;
  files: TFile[];
}
/** A transfer happening in ANOTHER window/device - driven by relayed `transfer.*` events. */
interface RemoteTransfer {
  batchId: string;
  by: string;
  volumeLabel: string;
  dot: string;
  count: number;
  pct: number;
  done: boolean;
}

const TransfersContext = createContext<{
  upload: (v: VolumeSummary, files: File[], keyPrefix?: string) => void;
} | null>(null);

export function useTransfers() {
  const ctx = useContext(TransfersContext);
  if (!ctx) throw new Error("useTransfers must be used within <TransfersProvider>");
  return ctx;
}

/** PUT a file with real upload progress (fetch can't report it; XHR can). Direct to the bucket. */
function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string> | undefined,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener("load", () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`upload failed (${xhr.status})`)),
    );
    xhr.addEventListener("error", () => reject(new Error("network error")));
    xhr.send(file);
  });
}

export function TransfersProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, setState] = useState<TransferState | null>(null);
  const [remote, setRemote] = useState<RemoteTransfer | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const remoteTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const socketRef = useRef<WebSocket | null>(null);

  // ── Live socket: pokes + remote transfer presence (sync-engine.md). Client-only. ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    let closed = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/api/ns/socket`);
      socketRef.current = ws;
      ws.addEventListener("message", (e) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(typeof e.data === "string" ? e.data : "") as Record<string, unknown>;
        } catch {
          return;
        }
        if (msg.type === "poke") {
          // Head advanced elsewhere - refresh the tree/listing + volumes.
          void qc.invalidateQueries({ queryKey: ["objects"] });
          void qc.invalidateQueries({ queryKey: ["volumes"] });
          return;
        }
        if (msg.type === "transfer.start") {
          clearTimeout(remoteTimer.current);
          setRemote({
            batchId: String(msg.batchId),
            by: String(msg.by ?? "Someone"),
            volumeLabel: String(msg.volumeLabel ?? "a volume"),
            dot: typeof msg.dot === "string" ? msg.dot : "bg-primary",
            count: Number(msg.count ?? 1),
            pct: 0,
            done: false,
          });
        } else if (msg.type === "transfer.progress") {
          setRemote((r) => (r && r.batchId === msg.batchId ? { ...r, pct: Number(msg.pct) } : r));
        } else if (msg.type === "transfer.end") {
          setRemote((r) => (r && r.batchId === msg.batchId ? { ...r, pct: 100, done: true } : r));
          if (typeof msg.volumeId === "string") {
            void qc.invalidateQueries({ queryKey: ["objects", msg.volumeId] }); // file appears here
          }
          remoteTimer.current = setTimeout(() => setRemote(null), 4000);
        }
      });
      ws.addEventListener("close", () => {
        socketRef.current = null;
        if (!closed) retry = setTimeout(connect, 2000); // simple reconnect
      });
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
      socketRef.current = null;
    };
  }, [qc]);

  const relay = (m: Record<string, unknown>) => {
    const s = socketRef.current;
    if (s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify(m));
  };

  // Upload into `parentGid` of the namespace tree, storing bytes on `volume` (the drop target):
  // hash → commit-intent (dedup) → presigned PUT to chunks/<hash> → createFile op (→ DO poke).
  const upload = useCallback(
    (volume: VolumeSummary, files: File[], parentGid = "root") => {
      if (files.length === 0) return;
      clearTimeout(dismissTimer.current);
      const dot = providerFor(volume.provider).dot;
      const batchId = crypto.randomUUID();

      const tfiles: TFile[] = files.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        progress: 0,
        status: "uploading",
      }));
      setState({ volumeLabel: volume.label, dot, files: tfiles });
      relay({
        type: "transfer.start",
        batchId,
        volumeId: volume.id,
        volumeLabel: volume.label,
        dot,
        count: files.length,
      });

      const patch = (id: string, partial: Partial<TFile>) =>
        setState((s) =>
          s ? { ...s, files: s.files.map((f) => (f.id === id ? { ...f, ...partial } : f)) } : s,
        );

      const fractions = Array.from({ length: files.length }, () => 0);
      let lastPct = -1;
      const relayProgress = () => {
        const pct = Math.round((fractions.reduce((a, b) => a + b, 0) / files.length) * 100);
        if (pct !== lastPct) {
          lastPct = pct;
          relay({ type: "transfer.progress", batchId, pct });
        }
      };

      void Promise.all(
        files.map(async (file, i) => {
          const fid = tfiles[i].id;
          try {
            const hash = await sha256Hex(file);
            const { missing } = await treeCommitIntent({
              data: { volumeId: volume.id, hashes: [hash] },
            });
            if (missing.includes(hash)) {
              const presigned = await uploadIntent({ data: { volumeId: volume.id, hash } });
              await putWithProgress(presigned.url, file, presigned.headers, (frac) => {
                fractions[i] = frac;
                patch(fid, { progress: Math.round(frac * 100) });
                relayProgress();
              });
            } else {
              fractions[i] = 1; // dedup: byte-identical chunk already in the bucket
              relayProgress();
            }
            // Metadata only after bytes are durable - the createFile op makes it appear everywhere.
            await treeCommit({
              data: {
                type: "createFile",
                gid: `node_${crypto.randomUUID()}`,
                parentGid,
                name: file.name,
                volumeId: volume.id,
                versionId: `ver_${crypto.randomUUID()}`,
                blocklist: [{ hash, size: file.size }],
                size: file.size,
                sha256: hash,
              },
            });
            patch(fid, { progress: 100, status: "done" });
          } catch {
            patch(fid, { status: "error" });
          }
        }),
      ).finally(() => {
        void qc.invalidateQueries({ queryKey: ["tree"] });
        relay({ type: "transfer.end", batchId, volumeId: volume.id, count: files.length });
        dismissTimer.current = setTimeout(() => setState(null), 4500);
      });
    },
    [qc],
  );

  const value = useMemo(() => ({ upload }), [upload]);

  return (
    <TransfersContext.Provider value={value}>
      {children}
      {state && <TransferToast state={state} onClose={() => setState(null)} />}
      {remote && (
        <RemoteToast remote={remote} onClose={() => setRemote(null)} bottom={state ? 188 : 20} />
      )}
    </TransfersContext.Provider>
  );
}

function TransferToast({ state, onClose }: { state: TransferState; onClose: () => void }) {
  const done = state.files.filter((f) => f.status === "done").length;
  const failed = state.files.filter((f) => f.status === "error").length;
  const total = state.files.length;
  const allFinished = done + failed === total;

  return (
    <div className="toast-in fixed right-5 bottom-5 z-50 w-[332px] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <span className={cn("size-2.5 rounded-full", state.dot)} />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold">
            {allFinished
              ? `${done} file${done === 1 ? "" : "s"} uploaded${failed ? ` · ${failed} failed` : ""}`
              : `Uploading ${total} file${total === 1 ? "" : "s"}`}
          </div>
          <div className="text-[11.5px] text-muted-foreground">
            to <span className="text-foreground">{state.volumeLabel}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-2 px-3.5 pb-3">
        {state.files.map((f) => (
          <div key={f.id}>
            <div className="flex items-center gap-2 text-[12.5px]">
              <span className="flex-1 truncate text-muted-foreground">{f.name}</span>
              {f.status === "error" ? (
                <TriangleAlert className="size-3.5 text-destructive" />
              ) : f.status === "done" ? (
                <Check className="size-3.5 text-ok" />
              ) : (
                <span className="font-mono text-[11px] text-muted-foreground">{f.progress}%</span>
              )}
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-300",
                  f.status === "error" ? "bg-destructive" : "bg-primary",
                )}
                style={{ width: `${f.status === "error" ? 100 : f.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-secondary/40 px-3.5 py-2.5">
        <ShieldCheck className="size-[15px] shrink-0 text-primary" />
        <span className="text-[11.5px] text-muted-foreground">
          <span className="font-medium text-foreground">Direct transfer.</span> byos3 never sees
          your bytes.
        </span>
      </div>
    </div>
  );
}

/** Live presence for an upload in another window/device. */
function RemoteToast({
  remote,
  onClose,
  bottom,
}: {
  remote: RemoteTransfer;
  onClose: () => void;
  bottom: number;
}) {
  return (
    <div
      className="toast-in fixed right-5 z-50 w-[300px] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      style={{ bottom }}
    >
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <ArrowUpFromLine className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">
            {remote.done ? "Uploaded" : "Uploading"} {remote.count} file
            {remote.count === 1 ? "" : "s"}
          </div>
          <div className="truncate text-[11.5px] text-muted-foreground">
            by {remote.by} ·{" "}
            <span className={cn("inline-block size-1.5 rounded-full align-middle", remote.dot)} />{" "}
            {remote.volumeLabel}
          </div>
        </div>
        {remote.done ? (
          <Check className="size-4 text-ok" />
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground">{remote.pct}%</span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-secondary"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="h-1 overflow-hidden bg-secondary">
        <div
          className="h-full bg-primary transition-[width] duration-300"
          style={{ width: `${remote.pct}%` }}
        />
      </div>
    </div>
  );
}
