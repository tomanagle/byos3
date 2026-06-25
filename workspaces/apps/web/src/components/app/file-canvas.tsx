import { createId } from "@byos3/core";
import type { VolumeSummary } from "@byos3/services";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  CloudOff,
  FileText,
  Folder,
  FolderPlus,
  Grid2x2,
  Grid3x3,
  Inbox,
  LayoutGrid,
  List,
  ListTree,
  Upload,
} from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import type { TreeEntry } from "#/fn/tree";
import { treeAncestors, treeCommit, treeList } from "#/fn/tree";
import { useFileView } from "#/lib/use-file-view";
import { type ProviderMeta, providerFor } from "#/lib/providers";
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

// Internal drag-and-drop: dragging a file/folder carries its gid under this key so a folder can
// accept it as a `move`. Distinct from the OS "Files" drag (which means upload), so the two never
// collide. See sync-engine.md (move op).
const GID_MIME = "application/x-byos3-gid";

function draggable(gid: string) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(GID_MIME, gid);
      e.dataTransfer.effectAllowed = "move";
    },
  };
}

/** A folder rendered as a button that is BOTH draggable (it can be moved) and a drop target (other
 * nodes can be dropped into it). `onActivate` = click (navigate/expand); a drop fires `onMove`. */
function FolderDropZone({
  folderGid,
  onMove,
  onActivate,
  className,
  activeClassName,
  title,
  children,
}: {
  folderGid: string;
  onMove: (gid: string, newParentGid: string) => void;
  onActivate: () => void;
  className: string;
  activeClassName: string;
  title?: string;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={onActivate}
      {...draggable(folderGid)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(GID_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(GID_MIME)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const gid = e.dataTransfer.getData(GID_MIME);
        if (gid && gid !== folderGid) onMove(gid, folderGid);
      }}
      className={cn(className, over && activeClassName)}
    >
      {children}
    </button>
  );
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
  const { fileView, gridSize, setFileView, setGridSize } = useFileView();

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
  const moveNode = useMutation({
    mutationFn: (vars: { gid: string; newParentGid: string }) =>
      treeCommit({ data: { type: "move", gid: vars.gid, newParentGid: vars.newParentGid } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tree"] });
      void qc.invalidateQueries({ queryKey: ["ancestors"] });
    },
  });
  // Drop a node into a folder. The DO rejects invalid moves (into self/descendant); ignore the
  // no-op of dropping onto the current parent.
  const onMove = (gid: string, newParentGid: string) => {
    if (gid !== newParentGid) moveNode.mutate({ gid, newParentGid });
  };

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
            <Crumb
              onActivate={() => onNavigateFolder("root")}
              onMove={onMove}
              targetGid="root"
              className="rounded px-1.5 py-0.5 font-display text-lg font-semibold tracking-tight hover:bg-secondary"
            >
              Files
            </Crumb>
            {(crumbs.data ?? []).map((c) => (
              <span key={c.gid} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
                <Crumb
                  onActivate={() => onNavigateFolder(c.gid)}
                  onMove={onMove}
                  targetGid={c.gid}
                  className="truncate rounded px-1.5 py-0.5 hover:bg-secondary"
                >
                  {c.name}
                </Crumb>
              </span>
            ))}
          </nav>
          <div className="flex-1" />

          <ViewControls
            fileView={fileView}
            gridSize={gridSize}
            onFileView={setFileView}
            onGridSize={setGridSize}
          />

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
              className="h-8 flex-1 rounded-md border border-border bg-card px-2.5 text-base outline-none focus:border-primary/50"
            />
            <button
              type="submit"
              disabled={newFolder.isPending}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
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
          ) : fileView === "grid" ? (
            <GridView
              folders={folders}
              files={files}
              gridSize={gridSize}
              selectedGid={selectedGid}
              onNavigateFolder={onNavigateFolder}
              onSelectGid={onSelectGid}
              onMove={onMove}
              providerOf={volumeProvider}
            />
          ) : fileView === "tree" ? (
            <FileTree
              parentGid={folderGid}
              depth={0}
              selectedGid={selectedGid}
              onSelectGid={onSelectGid}
              onMove={onMove}
              volumes={volumes}
            />
          ) : (
            <ListView
              folders={folders}
              files={files}
              selectedGid={selectedGid}
              onNavigateFolder={onNavigateFolder}
              onSelectGid={onSelectGid}
              onMove={onMove}
              providerOf={volumeProvider}
            />
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border px-6 py-2 text-xs text-muted-foreground">
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

// ── View toolbar control ──────────────────────────────────────────────────────

const VIEW_OPTIONS = [
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "list", label: "List", icon: List },
  { id: "tree", label: "Tree", icon: ListTree },
] as const;

function ViewControls({
  fileView,
  gridSize,
  onFileView,
  onGridSize,
}: {
  fileView: "grid" | "list" | "tree";
  gridSize: "small" | "large";
  onFileView: (v: "grid" | "list" | "tree") => void;
  onGridSize: (s: "small" | "large") => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {fileView === "grid" && (
        <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
          <SegBtn
            active={gridSize === "small"}
            title="Small icons"
            onClick={() => onGridSize("small")}
          >
            <Grid3x3 className="size-4" />
          </SegBtn>
          <SegBtn
            active={gridSize === "large"}
            title="Large icons"
            onClick={() => onGridSize("large")}
          >
            <Grid2x2 className="size-4" />
          </SegBtn>
        </div>
      )}
      <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
        {VIEW_OPTIONS.map((o) => (
          <SegBtn
            key={o.id}
            active={fileView === o.id}
            title={`${o.label} view`}
            onClick={() => onFileView(o.id)}
          >
            <o.icon className="size-4" />
          </SegBtn>
        ))}
      </div>
    </div>
  );
}

function SegBtn({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md transition-colors",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** A breadcrumb segment: clicking navigates; dropping a node onto it moves the node up into that
 * ancestor (or root). */
function Crumb({
  targetGid,
  onActivate,
  onMove,
  className,
  children,
}: {
  targetGid: string;
  onActivate: () => void;
  onMove: (gid: string, newParentGid: string) => void;
  className: string;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      onClick={onActivate}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(GID_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes(GID_MIME)) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        const gid = e.dataTransfer.getData(GID_MIME);
        if (gid && gid !== targetGid) onMove(gid, targetGid);
      }}
      className={cn(className, over && "bg-primary/15 text-primary")}
    >
      {children}
    </button>
  );
}

// ── List view ────────────────────────────────────────────────────────────────

function ListView({
  folders,
  files,
  selectedGid,
  onNavigateFolder,
  onSelectGid,
  onMove,
  providerOf,
}: {
  folders: TreeEntry[];
  files: TreeEntry[];
  selectedGid: string | null;
  onNavigateFolder: (gid: string) => void;
  onSelectGid: (gid: string | null) => void;
  onMove: (gid: string, newParentGid: string) => void;
  providerOf: (volumeId: string | null) => ProviderMeta;
}) {
  const row =
    "grid w-full grid-cols-[1fr_120px] items-center gap-3 rounded-lg px-3 py-2.5 text-left";
  return (
    <>
      <div className="grid grid-cols-[1fr_120px] gap-3 border-b border-border px-3 py-2 text-xs font-semibold tracking-[0.03em] text-muted-foreground/70 uppercase">
        <span>Name</span>
        <span>Size</span>
      </div>
      <div className="flex flex-col gap-1.5 pt-1.5">
        {folders.map((f) => (
          <FolderDropZone
            key={f.gid}
            folderGid={f.gid}
            onMove={onMove}
            onActivate={() => onNavigateFolder(f.gid)}
            className={cn(row, "transition-colors hover:bg-secondary/60")}
            activeClassName="bg-primary/10 ring-2 ring-primary/50 ring-inset"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                <Folder className="size-4" />
              </span>
              <span className="truncate text-base font-medium">{f.name}</span>
            </span>
            <span className="font-mono text-sm text-muted-foreground/70">folder</span>
          </FolderDropZone>
        ))}
        {files.map((f) => {
          const p = providerOf(f.volumeId);
          return (
            <button
              key={f.gid}
              type="button"
              {...draggable(f.gid)}
              onClick={() => onSelectGid(f.gid === selectedGid ? null : f.gid)}
              className={cn(
                row,
                "transition-colors",
                f.gid === selectedGid ? "bg-primary/10" : "hover:bg-secondary/60",
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="relative grid size-9 shrink-0 place-items-center rounded-md bg-secondary font-mono text-xs font-bold text-muted-foreground">
                  {ext(f.name) || <FileText className="size-4" />}
                  <span
                    className={cn(
                      "absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background",
                      p.dot,
                    )}
                    title={p.label}
                  />
                </span>
                <span className="truncate text-base font-medium">{f.name}</span>
              </span>
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {formatBytes(f.size)}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ── Grid view (small / large icons, like Finder) ───────────────────────────────

function GridView({
  folders,
  files,
  gridSize,
  selectedGid,
  onNavigateFolder,
  onSelectGid,
  onMove,
  providerOf,
}: {
  folders: TreeEntry[];
  files: TreeEntry[];
  gridSize: "small" | "large";
  selectedGid: string | null;
  onNavigateFolder: (gid: string) => void;
  onSelectGid: (gid: string | null) => void;
  onMove: (gid: string, newParentGid: string) => void;
  providerOf: (volumeId: string | null) => ProviderMeta;
}) {
  const large = gridSize === "large";
  const cols = large
    ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    : "grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8";
  const tile = cn(
    "group flex flex-col items-center gap-2 rounded-xl border border-transparent text-center transition-colors",
    large ? "p-4" : "p-3",
  );
  const iconBox = large ? "size-16" : "size-11";
  const glyph = large ? "size-7" : "size-5";

  return (
    <div className={cn("grid p-2", large ? "gap-4" : "gap-3", cols)}>
      {folders.map((f) => (
        <FolderDropZone
          key={f.gid}
          folderGid={f.gid}
          onMove={onMove}
          onActivate={() => onNavigateFolder(f.gid)}
          className={cn(tile, "hover:border-border hover:bg-secondary/50")}
          activeClassName="border-primary/60 bg-primary/10 ring-2 ring-primary/40"
        >
          <span
            className={cn(
              "grid shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground",
              iconBox,
            )}
          >
            <Folder className={glyph} />
          </span>
          <span className="line-clamp-2 w-full text-base font-medium break-words">{f.name}</span>
        </FolderDropZone>
      ))}
      {files.map((f) => {
        const p = providerOf(f.volumeId);
        return (
          <button
            key={f.gid}
            type="button"
            {...draggable(f.gid)}
            onClick={() => onSelectGid(f.gid === selectedGid ? null : f.gid)}
            className={cn(
              tile,
              f.gid === selectedGid
                ? "border-primary/40 bg-primary/10"
                : "hover:border-border hover:bg-secondary/50",
            )}
          >
            <span
              className={cn(
                "relative grid shrink-0 place-items-center rounded-xl bg-secondary font-mono font-bold text-muted-foreground",
                iconBox,
                large ? "text-sm" : "text-xs",
              )}
            >
              {ext(f.name) || <FileText className={glyph} />}
              <span
                className={cn(
                  "absolute -top-1 -right-1 size-3 rounded-full ring-2 ring-background",
                  p.dot,
                )}
                title={p.label}
              />
            </span>
            <span className="line-clamp-2 w-full text-base font-medium break-words">{f.name}</span>
            {f.size != null && (
              <span className="font-mono text-sm tabular-nums text-muted-foreground/80">
                {formatBytes(f.size)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Tree view (lazy-expanding hierarchy) ───────────────────────────────────────

const INDENT = 16;

function FileTree({
  parentGid,
  depth,
  selectedGid,
  onSelectGid,
  onMove,
  volumes,
}: {
  parentGid: string;
  depth: number;
  selectedGid: string | null;
  onSelectGid: (gid: string | null) => void;
  onMove: (gid: string, newParentGid: string) => void;
  volumes: VolumeSummary[];
}) {
  const tree = useQuery({
    queryKey: ["tree", parentGid],
    queryFn: () => treeList({ data: { parentGid } }),
  });

  if (tree.isLoading) {
    return (
      <div className="px-3 py-1.5" style={{ paddingLeft: depth * INDENT + 12 }}>
        <div className="h-6 w-40 animate-pulse rounded bg-secondary/50" />
      </div>
    );
  }
  const entries = tree.data ?? [];
  const folders = entries.filter((e) => e.type === "folder");
  const files = entries.filter((e) => e.type === "file");

  return (
    <div className="flex flex-col gap-0.5">
      {folders.map((f) => (
        <TreeFolder
          key={f.gid}
          folder={f}
          depth={depth}
          selectedGid={selectedGid}
          onSelectGid={onSelectGid}
          onMove={onMove}
          volumes={volumes}
        />
      ))}
      {files.map((f) => (
        <TreeFileRow
          key={f.gid}
          file={f}
          depth={depth}
          provider={providerFor(volumes.find((v) => v.id === f.volumeId)?.provider)}
          selected={f.gid === selectedGid}
          onSelect={() => onSelectGid(f.gid === selectedGid ? null : f.gid)}
        />
      ))}
    </div>
  );
}

function TreeFolder({
  folder,
  depth,
  selectedGid,
  onSelectGid,
  onMove,
  volumes,
}: {
  folder: TreeEntry;
  depth: number;
  selectedGid: string | null;
  onSelectGid: (gid: string | null) => void;
  onMove: (gid: string, newParentGid: string) => void;
  volumes: VolumeSummary[];
}) {
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        {...draggable(folder.gid)}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(GID_MIME)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes(GID_MIME)) return;
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          const gid = e.dataTransfer.getData(GID_MIME);
          if (gid && gid !== folder.gid) onMove(gid, folder.gid);
        }}
        style={{ paddingLeft: depth * INDENT + 12 }}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left transition-colors",
          over ? "bg-primary/10 ring-2 ring-primary/50 ring-inset" : "hover:bg-secondary/60",
        )}
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground/70 transition-transform",
            open && "rotate-90",
          )}
        />
        <Folder className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-base font-medium">{folder.name}</span>
      </button>
      {open && (
        <FileTree
          parentGid={folder.gid}
          depth={depth + 1}
          selectedGid={selectedGid}
          onSelectGid={onSelectGid}
          onMove={onMove}
          volumes={volumes}
        />
      )}
    </>
  );
}

function TreeFileRow({
  file,
  depth,
  provider,
  selected,
  onSelect,
}: {
  file: TreeEntry;
  depth: number;
  provider: ProviderMeta;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      {...draggable(file.gid)}
      onClick={onSelect}
      style={{ paddingLeft: depth * INDENT + 12 + INDENT }}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg py-2 pr-3 text-left transition-colors",
        selected ? "bg-primary/10" : "hover:bg-secondary/60",
      )}
    >
      <span className="relative shrink-0">
        <FileText className="size-4 text-muted-foreground" />
        <span
          className={cn(
            "absolute -top-1 -right-1 size-2 rounded-full ring-1 ring-background",
            provider.dot,
          )}
          title={provider.label}
        />
      </span>
      <span className="min-w-0 flex-1 truncate text-base font-medium">{file.name}</span>
      <span className="font-mono text-sm tabular-nums text-muted-foreground/80">
        {formatBytes(file.size)}
      </span>
    </button>
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
