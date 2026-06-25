import { createId } from "@byos3/core";
import type { VolumeSummary } from "@byos3/services";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CloudOff, FileText, Folder, FolderPlus, Inbox, Upload } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { treeAncestors, treeCommit, treeList } from "#/fn/tree";
import { providerFor } from "#/lib/providers";
import { cn } from "#/lib/utils";
import { Inspector } from "./inspector";
import { useTransfers } from "./transfers";

function formatBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

function ext(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1, dot + 5).toUpperCase() : "";
}

function allowFileDrop(e: DragEvent) {
  if (e.dataTransfer.types.includes("Files")) e.preventDefault();
}

export function FileCanvas({
  volumes,
  dropVolumeId,
  folderGid,
  onNavigateFolder,
  selectedGid,
  onSelectGid,
}: {
  volumes: VolumeSummary[];
  /** the active volume = where new uploads' bytes land */
  dropVolumeId: string | null;
  /** current folder node gid ("root" = top) */
  folderGid: string;
  onNavigateFolder: (gid: string) => void;
  selectedGid: string | null;
  onSelectGid: (gid: string | null) => void;
}) {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [folderName, setFolderName] = useState("");
  const { upload } = useTransfers();

  const dropVolume = volumes.find((v) => v.id === dropVolumeId) ?? volumes[0];
  const volumeProvider = (volumeId: string | null) =>
    providerFor(volumes.find((v) => v.id === volumeId)?.provider);

  const tree = useQuery({
    queryKey: ["tree", folderGid],
    queryFn: () => treeList({ data: { parentGid: folderGid } }),
  });
  const crumbs = useQuery({
    queryKey: ["ancestors", folderGid],
    queryFn: () => treeAncestors({ data: { gid: folderGid } }),
    enabled: folderGid !== "root",
  });
  const newFolder = useMutation({
    mutationFn: (name: string) =>
      treeCommit({
        data: {
          type: "createFolder",
          gid: createId("node"),
          parentGid: folderGid,
          name,
        },
      }),
    onSuccess: () => {
      setCreating(false);
      setFolderName("");
      void qc.invalidateQueries({ queryKey: ["tree", folderGid] });
    },
  });

  const entries = tree.data ?? [];
  const folders = entries.filter((e) => e.type === "folder");
  const files = entries.filter((e) => e.type === "file");
  const empty = entries.length === 0;
  const selected = selectedGid ? files.find((f) => f.gid === selectedGid) : undefined;

  function startUpload(dropped: File[]) {
    if (dropVolume) upload(dropVolume, dropped, folderGid);
  }
  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    startUpload(Array.from(e.target.files ?? []));
    e.target.value = "";
  }
  function onDragEnter(e: DragEvent) {
    if (!e.dataTransfer.types.includes("Files") || !dropVolume) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }
  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragging(false);
    }
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    startUpload(Array.from(e.dataTransfer.files ?? []));
  }

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <div
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
        onDragEnter={onDragEnter}
        onDragOver={allowFileDrop}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragging && dropVolume && (
          <div className="pointer-events-none absolute inset-3 z-20 grid place-items-center rounded-2xl border-2 border-dashed border-primary/60 bg-primary/10 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Upload className="size-8" strokeWidth={2} />
              <span className="font-display text-lg font-semibold">
                Drop to upload to {dropVolume.label}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 border-b border-border px-6 py-3.5">
          <nav className="flex min-w-0 items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => onNavigateFolder("root")}
              className="rounded px-1.5 py-0.5 font-display text-lg font-semibold tracking-tight hover:bg-secondary"
            >
              Files
            </button>
            {(crumbs.data ?? []).map((c) => (
              <span key={c.gid} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                <button
                  type="button"
                  onClick={() => onNavigateFolder(c.gid)}
                  className="truncate rounded px-1.5 py-0.5 hover:bg-secondary"
                >
                  {c.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setCreating((c) => !c)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary px-3 text-sm font-medium hover:bg-accent"
          >
            <FolderPlus className="size-4" /> New folder
          </button>
          <input ref={fileInput} type="file" multiple hidden onChange={pickFiles} />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={!dropVolume}
            title={dropVolume ? `Upload to ${dropVolume.label}` : "Connect a volume first"}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-[0_6px_18px_-6px] shadow-primary/50 transition-all hover:brightness-110 disabled:opacity-50"
          >
            <Upload className="size-4" strokeWidth={2.2} /> Upload
          </button>
        </div>

        {creating && (
          <form
            className="flex items-center gap-2 border-b border-border bg-secondary/40 px-6 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (folderName.trim()) newFolder.mutate(folderName.trim());
            }}
          >
            <Folder className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Folder name"
              className="h-8 flex-1 rounded-md border border-border bg-card px-2.5 text-sm outline-none focus:border-primary/50"
            />
            <button
              type="submit"
              disabled={newFolder.isPending}
              className="text-sm font-medium text-primary"
            >
              {newFolder.isPending ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-sm text-muted-foreground"
            >
              Cancel
            </button>
          </form>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {tree.isLoading ? (
            <div className="space-y-1.5 p-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary/50" />
              ))}
            </div>
          ) : tree.isError ? (
            <State
              icon={CloudOff}
              title="Couldn't load this folder"
              body="Try again in a moment."
            />
          ) : empty ? (
            <State
              icon={Inbox}
              title="Nothing here yet"
              body={
                dropVolume
                  ? "Drop files anywhere here, or use Upload - they transfer straight to your bucket."
                  : "Connect a volume first, then drop files here."
              }
              action={
                dropVolume ? (
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary px-3.5 text-sm font-medium hover:bg-accent"
                  >
                    <Upload className="size-4" /> Upload your first file
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-[1fr_120px] gap-3 border-b border-border px-3 py-2 text-[11.5px] font-semibold uppercase tracking-[0.03em] text-muted-foreground/70">
                <span>Name</span>
                <span>Size</span>
              </div>
              {folders.map((f) => (
                <button
                  key={f.gid}
                  type="button"
                  onClick={() => onNavigateFolder(f.gid)}
                  className="grid w-full grid-cols-[1fr_120px] items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-secondary/60"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                      <Folder className="size-4" />
                    </span>
                    <span className="truncate text-[13.5px] font-medium">{f.name}</span>
                  </span>
                  <span className="font-mono text-[12.5px] text-muted-foreground/70">folder</span>
                </button>
              ))}
              {files.map((f) => {
                const p = volumeProvider(f.volumeId);
                return (
                  <button
                    key={f.gid}
                    type="button"
                    onClick={() => onSelectGid(f.gid === selectedGid ? null : f.gid)}
                    className={cn(
                      "grid w-full grid-cols-[1fr_120px] items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                      f.gid === selectedGid ? "bg-primary/10" : "hover:bg-secondary/60",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="relative grid size-9 shrink-0 place-items-center rounded-md bg-secondary font-mono text-[9px] font-bold text-muted-foreground">
                        {ext(f.name) || <FileText className="size-4" />}
                        <span
                          className={cn(
                            "absolute -right-0.5 -top-0.5 size-2.5 rounded-full ring-2 ring-background",
                            p.dot,
                          )}
                          title={p.label}
                        />
                      </span>
                      <span className="truncate text-[13.5px] font-medium">{f.name}</span>
                    </span>
                    <span className="font-mono text-[12.5px] tabular-nums text-muted-foreground">
                      {formatBytes(f.size)}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-6 py-2 text-[11.5px] text-muted-foreground">
          {dropVolume && (
            <>
              <Upload className="size-3" />
              dropping into <span className="text-foreground">{dropVolume.label}</span> ·
            </>
          )}
          <span>
            {folders.length} folder{folders.length === 1 ? "" : "s"} · {files.length} file
            {files.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {selected && (
        <Inspector
          entry={{
            gid: selected.gid,
            name: selected.name,
            volumeId: selected.volumeId,
            sha256: selected.sha256,
            size: selected.size,
          }}
          volumeLabel={volumes.find((v) => v.id === selected.volumeId)?.label ?? "volume"}
          provider={volumeProvider(selected.volumeId)}
          onClose={() => onSelectGid(null)}
        />
      )}
    </div>
  );
}

function State({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof Inbox;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid h-full place-items-center px-6 py-16 text-center">
      <div className="max-w-sm">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-secondary text-muted-foreground">
          <Icon className="size-6" />
        </div>
        <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
        {action}
      </div>
    </div>
  );
}
