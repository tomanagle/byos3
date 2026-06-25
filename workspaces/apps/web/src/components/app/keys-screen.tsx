import { useMutation } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { createApiKey } from "#/fn/api-keys";
import { cn } from "#/lib/utils";

const SCOPES: { id: string; label: string; hint?: string }[] = [
  { id: "file:read", label: "Read files", hint: "list + download" },
  { id: "file:create", label: "Upload files" },
  { id: "file:delete", label: "Delete files" },
  { id: "volume:list", label: "List volumes" },
  { id: "volume:mount", label: "Connect buckets" },
];

export function KeysScreen() {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({
    "file:read": true,
    "volume:list": true,
  });
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: (vars: { name: string; permissions: Record<string, string[]> }) =>
      createApiKey({ data: vars }),
  });

  function submit() {
    const permissions: Record<string, string[]> = {};
    for (const [id, on] of Object.entries(selected)) {
      if (!on) continue;
      const [resource, action] = id.split(":");
      (permissions[resource] ??= []).push(action);
    }
    create.mutate({ name: name.trim() || "api key", permissions });
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-6">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">API keys</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Everything here you can do programmatically at{" "}
          <span className="font-mono">api.byos3.com</span>. A key never exceeds your own
          permissions.
        </p>
      </div>

      {create.data ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-medium text-ok">
            <Check className="size-4" /> Key created - copy it now, it won&apos;t be shown again.
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-secondary/60 p-2.5">
            <code className="flex-1 truncate font-mono text-[13px]">{create.data.key}</code>
            <button
              type="button"
              onClick={() => copy(create.data!.key)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-accent"
            >
              {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => create.reset()}
            className="mt-4 text-sm font-medium text-primary hover:underline"
          >
            Create another key
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-muted-foreground">Key name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="CI · deploy"
              className="h-9 rounded-lg border border-border bg-secondary/60 px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </label>

          <div className="mt-5">
            <span className="text-[12.5px] font-medium text-muted-foreground">Scopes</span>
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
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-mono text-[12.5px]">{s.id}</span>
                      {s.hint && (
                        <span className="block text-[11px] text-muted-foreground">{s.hint}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {create.isError && (
            <p className="mt-3 text-sm text-destructive">
              Couldn&apos;t create the key. Try again.
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={create.isPending}
            className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
          >
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            Create key
          </button>
        </div>
      )}
    </div>
  );
}
