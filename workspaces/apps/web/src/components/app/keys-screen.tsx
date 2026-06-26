import type { ApiKeyVolumeScope } from "@byos3/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Boxes,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Power,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Modal } from "#/components/ui/modal";
import {
  type ApiKeySummary,
  createApiKey,
  deleteApiKey,
  listApiKeys,
  updateApiKey,
} from "#/fn/api-keys";
import { cn } from "#/lib/utils";
import { useWorkspace } from "./app-shell";

const SCOPES: { id: string; label: string; hint?: string }[] = [
  { id: "file:read", label: "Read files", hint: "list + download" },
  { id: "file:create", label: "Upload files" },
  { id: "file:delete", label: "Delete files" },
  { id: "volume:list", label: "List volumes" },
  { id: "volume:mount", label: "Connect buckets" },
];

const KEYS_QUERY = ["api-keys"] as const;

function fmtDate(ms: number | null): string {
  if (!ms) return "never";
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function KeysScreen() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const keys = useQuery({ queryKey: KEYS_QUERY, queryFn: () => listApiKeys() });

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold tracking-tight">API keys</h1>
          <p className="mt-1 text-base text-muted-foreground">
            Keys belong to your organization, so your whole team shares and manages them. Everything
            here you can do programmatically at <span className="font-mono">api.byos3.com</span>. A
            key never exceeds the scopes you grant it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:brightness-110"
        >
          <Plus className="size-4" />
          Create key
        </button>
      </div>

      {keys.isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading keys…
        </div>
      ) : keys.data && keys.data.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {keys.data.map((k) => (
            <KeyRow key={k.id} apiKey={k} />
          ))}
        </ul>
      ) : (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed border-border bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <KeyRound className="size-5" />
          No keys yet. Create your first one.
        </button>
      )}

      <CreateKeyDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}

function CreateKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { volumes } = useWorkspace();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({
    "file:read": true,
    "volume:list": true,
  });
  // Volume scope (only relevant once a file:* scope is selected): "*" = every volume, or a set.
  const [volumeMode, setVolumeMode] = useState<"all" | "some">("all");
  const [volumeSet, setVolumeSet] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  const hasFilePerms = useMemo(
    () => Object.entries(selected).some(([id, on]) => on && id.startsWith("file:")),
    [selected],
  );
  const chosenVolumes = Object.keys(volumeSet).filter((id) => volumeSet[id]);
  const volumesInvalid = hasFilePerms && volumeMode === "some" && chosenVolumes.length === 0;

  const create = useMutation({
    mutationFn: (vars: {
      name: string;
      permissions: Record<string, string[]>;
      volumes?: ApiKeyVolumeScope;
    }) => createApiKey({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS_QUERY }),
  });

  function reset() {
    setName("");
    setSelected({ "file:read": true, "volume:list": true });
    setVolumeMode("all");
    setVolumeSet({});
    create.reset();
  }

  function close() {
    reset();
    onClose();
  }

  function submit() {
    const permissions: Record<string, string[]> = {};
    for (const [id, on] of Object.entries(selected)) {
      if (!on) continue;
      const [resource, action] = id.split(":");
      (permissions[resource] ??= []).push(action);
    }
    const volumeScope: ApiKeyVolumeScope | undefined = !hasFilePerms
      ? undefined
      : volumeMode === "all"
        ? "*"
        : chosenVolumes;
    create.mutate({ name: name.trim() || "api key", permissions, volumes: volumeScope });
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Modal open={open} onClose={close} className="max-w-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 pt-6 pb-5">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            {create.data ? "Key created" : "Create API key"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {create.data
              ? "Copy it now - the secret is shown only once."
              : "Grant only the scopes this key needs. It never exceeds them."}
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {create.data ? (
        <div className="px-6 py-5">
          <div className="flex items-center gap-2 text-sm font-medium text-ok">
            <Check className="size-4" /> Copy it now, it won&apos;t be shown again.
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-secondary/60 p-2.5">
            <code className="flex-1 truncate font-mono text-base">{create.data.key}</code>
            <button
              type="button"
              onClick={() => copy(create.data!.key)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-accent"
            >
              {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => create.reset()}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3.5 text-sm font-medium hover:bg-accent"
            >
              Create another
            </button>
            <button
              type="button"
              onClick={close}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:brightness-110"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-6 py-5">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Key name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="CI · deploy"
                className="h-9 rounded-lg border border-border bg-secondary/60 px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </label>

            <div className="mt-5">
              <span className="text-sm font-medium text-muted-foreground">Scopes</span>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SCOPES.map((s) => {
                  const on = selected[s.id] ?? false;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelected((p) => ({ ...p, [s.id]: !on }))}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        on
                          ? "border-primary/40 bg-primary/10"
                          : "border-border hover:bg-secondary/60",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-4 place-items-center rounded border",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                      >
                        {on && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-mono text-sm">{s.id}</span>
                        {s.hint && (
                          <span className="block text-xs text-muted-foreground">{s.hint}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {hasFilePerms && (
              <div className="mt-5">
                <span className="text-sm font-medium text-muted-foreground">File access</span>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Which volumes the file scopes apply to.
                </p>
                <div className="mt-2 flex gap-2">
                  {(["all", "some"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setVolumeMode(mode)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                        volumeMode === mode
                          ? "border-primary/40 bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-secondary/60",
                      )}
                    >
                      {mode === "all" ? "All volumes" : "Specific volumes"}
                    </button>
                  ))}
                </div>

                {volumeMode === "some" && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {volumes.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted-foreground">
                        No volumes yet. Connect a bucket first, or grant access to all volumes.
                      </p>
                    ) : (
                      volumes.map((v) => {
                        const on = volumeSet[v.id] ?? false;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setVolumeSet((p) => ({ ...p, [v.id]: !on }))}
                            className={cn(
                              "flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                              on
                                ? "border-primary/40 bg-primary/10"
                                : "border-border hover:bg-secondary/60",
                            )}
                          >
                            <span
                              className={cn(
                                "grid size-4 place-items-center rounded border",
                                on
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border",
                              )}
                            >
                              {on && <Check className="size-3" strokeWidth={3} />}
                            </span>
                            <Boxes className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 truncate text-sm">{v.label}</span>
                            <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                              {v.bucket}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            {create.isError && (
              <p className="mt-3 text-sm text-destructive">
                Couldn&apos;t create the key. Try again.
              </p>
            )}
          </div>

          <div className="sticky bottom-0 flex items-center justify-end gap-2.5 border-t border-border bg-card px-6 py-4">
            <button
              type="button"
              onClick={close}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3.5 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={create.isPending || volumesInvalid}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
            >
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Create key
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function KeyRow({ apiKey }: { apiKey: ApiKeySummary }) {
  const { volumes: allVolumes } = useWorkspace();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(apiKey.name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: KEYS_QUERY });
  const update = useMutation({
    mutationFn: (vars: { keyId: string; name?: string; enabled?: boolean }) =>
      updateApiKey({ data: vars }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (keyId: string) => deleteApiKey({ data: { keyId } }),
    onSuccess: invalidate,
  });

  const expired = apiKey.expiresAt != null && apiKey.expiresAt < Date.now();
  const status = expired
    ? { label: "Expired", cls: "text-destructive border-destructive/30 bg-destructive/10" }
    : apiKey.enabled
      ? { label: "Active", cls: "text-ok border-ok/30 bg-ok/10" }
      : { label: "Disabled", cls: "text-muted-foreground border-border bg-secondary/60" };

  const scopes = Object.entries(apiKey.permissions ?? {}).flatMap(([res, acts]) =>
    acts.map((a) => `${res}:${a}`),
  );
  // Volume scope for file ops. null = no file permissions (so no scope to show).
  let volumeScope: string | null = null;
  if (apiKey.volumes === "*") {
    volumeScope = "all volumes";
  } else if (Array.isArray(apiKey.volumes)) {
    volumeScope = apiKey.volumes
      .map((id) => allVolumes.find((v) => v.id === id)?.label ?? id)
      .join(", ");
  }
  const busy = update.isPending || remove.isPending;

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                className="h-8 flex-1 rounded-md border border-border bg-secondary/60 px-2.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
              <IconBtn
                title="Save name"
                onClick={() => {
                  setEditing(false);
                  if (draft.trim() && draft.trim() !== apiKey.name)
                    update.mutate({ keyId: apiKey.id, name: draft.trim() });
                }}
              >
                <Check className="size-4 text-ok" />
              </IconBtn>
              <IconBtn
                title="Cancel"
                onClick={() => {
                  setEditing(false);
                  setDraft(apiKey.name ?? "");
                }}
              >
                <X className="size-4" />
              </IconBtn>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate text-base font-medium">
                {apiKey.name ?? "Untitled key"}
              </span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
                  status.cls,
                )}
              >
                {status.label}
              </span>
            </div>
          )}
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            {apiKey.start ? `${apiKey.start}…` : apiKey.id}
          </div>
        </div>

        {!editing && (
          <div className="flex shrink-0 items-center gap-1">
            <IconBtn title="Rename" disabled={busy} onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
            </IconBtn>
            <IconBtn
              title={apiKey.enabled ? "Disable" : "Enable"}
              disabled={busy || expired}
              onClick={() => update.mutate({ keyId: apiKey.id, enabled: !apiKey.enabled })}
            >
              {apiKey.enabled ? <Ban className="size-4" /> : <Power className="size-4" />}
            </IconBtn>
            <IconBtn title="Revoke" disabled={busy} onClick={() => setConfirmDelete(true)} danger>
              {remove.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </IconBtn>
          </div>
        )}
      </div>

      {scopes.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {scopes.map((s) => (
            <span
              key={s}
              className="rounded-md border border-border bg-secondary/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {volumeScope && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Boxes className="size-3.5 shrink-0" />
          <span className="truncate">
            Files: <span className="text-foreground">{volumeScope}</span>
          </span>
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Created {fmtDate(apiKey.createdAt)}</span>
        <span>Last used {fmtDate(apiKey.lastRequest)}</span>
        {apiKey.expiresAt != null && <span>Expires {fmtDate(apiKey.expiresAt)}</span>}
        <span>{apiKey.requestCount} requests</span>
      </div>

      {confirmDelete && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
          <span className="text-sm">Revoke this key? Calls using it stop working immediately.</span>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(false);
                remove.mutate(apiKey.id);
              }}
              className="rounded-md bg-destructive px-2.5 py-1 text-xs font-semibold text-destructive-foreground hover:brightness-110"
            >
              Revoke
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40",
        danger && "hover:border-destructive/40 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}
