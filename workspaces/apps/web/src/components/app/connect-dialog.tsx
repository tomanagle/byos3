import type { ConnectBucketInput, ProviderId } from "@byos3/protocol";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Modal } from "#/components/ui/modal";
import { connectBucket } from "#/fn/connectors";
import { PROVIDER, PROVIDERS } from "#/lib/providers";
import { cn } from "#/lib/utils";
import { CorsSetup } from "./cors-setup";

interface FieldIssue {
  path?: string[];
  message?: string;
}

/** Server fns surface Zod failures as a JSON array of issues in the error message; parse them so we
 * can show the real, field-level reason ("endpoint: Invalid URL") instead of a generic message. */
function parseIssues(err: unknown): FieldIssue[] | null {
  const msg = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  try {
    const parsed: unknown = JSON.parse(msg);
    if (Array.isArray(parsed) && parsed.every((i) => typeof i === "object" && i !== null)) {
      return parsed as FieldIssue[];
    }
  } catch {
    // not a structured validation error
  }
  return null;
}

const EMPTY = {
  accessKeyId: "",
  secret: "",
  region: "us-east-1",
  bucket: "",
  endpoint: "",
  prefix: "byos3/",
  label: "",
};

export function ConnectDialog({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected: (volumeId: string) => void;
}) {
  const [provider, setProvider] = useState<ProviderId>("s3");
  const [form, setForm] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const m = useMutation({
    mutationFn: (input: ConnectBucketInput) => connectBucket({ data: input }),
  });

  // Named providers like S3 ship a default endpoint; everything else (custom, R2, B2, Wasabi,
  // MinIO) needs the user to supply their own - so the endpoint field is required for those.
  const meta = PROVIDER[provider];
  const endpointRequired = !meta.defaultEndpoint;
  const endpointMissing = endpointRequired && !form.endpoint.trim();

  function close() {
    m.reset();
    setForm(EMPTY);
    setProvider("s3");
    onClose();
  }

  function submit() {
    m.mutate({
      provider,
      endpoint: form.endpoint || PROVIDER[provider].defaultEndpoint || "",
      region: form.region || "auto",
      accessKeyId: form.accessKeyId,
      secret: form.secret,
      bucket: form.bucket,
      prefix: form.prefix || "byos3/",
      label: form.label || form.bucket,
    });
  }

  const result = m.data;
  const issues = m.isError ? parseIssues(m.error) : null;
  const endpointError = issues?.find((i) => i.path?.[0] === "endpoint")?.message;
  const footerError = m.isError
    ? (issues?.map((i) => `${(i.path ?? []).join(".") || "input"}: ${i.message}`).join(" · ") ??
      "Couldn't connect - double-check the details and try again.")
    : null;

  return (
    <Modal open={open} onClose={close} className="max-w-2xl">
      <div className="border-b border-border px-6 pt-6 pb-5">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-primary">
          Connect a bucket
        </div>
        <h2 className="mt-1.5 font-display text-2xl font-semibold tracking-tight">
          Bring your own storage
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Mount any S3-compatible bucket as a volume. Your files stay in your account - we keep only
          the encrypted credentials.
        </p>
      </div>

      {result ? (
        <div className="px-6 py-8 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-primary/15 text-primary">
            <Check className="size-6" strokeWidth={2.5} />
          </div>
          <h3 className="mt-4 font-display text-lg font-semibold">Volume mounted</h3>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{form.bucket}</p>
          {result.verified ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-ok/15 px-3 py-1 text-xs text-ok">
              <ShieldCheck className="size-3.5" /> Reachable · credentials verified
            </p>
          ) : (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-400">
              <TriangleAlert className="size-3.5" /> Couldn&apos;t verify ({result.reason}) -
              mounted anyway
            </p>
          )}
          <div className="mt-5 text-left">
            <CorsSetup volumeId={result.volumeId} />
          </div>
          <div className="mt-5">
            <Button
              onClick={() => {
                onConnected(result.volumeId);
                close();
              }}
              className="w-full"
            >
              Open volume
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="px-6 py-5">
            <div className="grid grid-cols-3 gap-2.5">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors",
                    provider === p.id
                      ? "border-primary/45 bg-primary/10 ring-1 ring-primary/45"
                      : "border-border bg-card hover:bg-secondary",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-md font-mono text-xs font-extrabold text-white",
                      p.dot,
                    )}
                  >
                    {p.tag}
                  </span>
                  <span className="text-[13.5px] font-medium">{p.label}</span>
                  <span className="text-[11.5px] text-muted-foreground">{p.hint}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Field label="Access key ID">
                <Input
                  className="font-mono text-[13px]"
                  value={form.accessKeyId}
                  onChange={set("accessKeyId")}
                  placeholder="AKIA…"
                />
              </Field>
              <Field label="Secret access key">
                <Input
                  className="font-mono text-[13px]"
                  type="password"
                  value={form.secret}
                  onChange={set("secret")}
                  placeholder="••••••••"
                />
              </Field>
              <Field label="Region">
                <Input
                  className="font-mono text-[13px]"
                  value={form.region}
                  onChange={set("region")}
                  placeholder="us-east-1"
                />
              </Field>
              <Field label="Bucket">
                <Input
                  className="font-mono text-[13px]"
                  value={form.bucket}
                  onChange={set("bucket")}
                  placeholder="my-bucket"
                />
              </Field>
              <div className="col-span-2">
                <Field
                  label={provider === "custom" ? "S3 endpoint URL" : "Endpoint"}
                  hint={endpointRequired ? "required" : "optional - defaults to AWS"}
                  help={meta.endpointHelp}
                  error={endpointError}
                >
                  <Input
                    className="font-mono text-[13px]"
                    value={form.endpoint}
                    onChange={set("endpoint")}
                    placeholder={
                      meta.defaultEndpoint ?? meta.endpointExample ?? "https://s3.example.com"
                    }
                  />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Prefix" hint="optional - scope this volume to a path">
                  <Input
                    className="font-mono text-[13px]"
                    value={form.prefix}
                    onChange={set("prefix")}
                    placeholder="byos3/"
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-card px-6 py-4">
            <div className="text-sm">
              {footerError ? (
                <span className="text-destructive">{footerError}</span>
              ) : (
                <span className="text-muted-foreground">
                  We&apos;ll verify access with a read-only check.
                </span>
              )}
            </div>
            <div className="flex gap-2.5">
              <Button variant="ghost" onClick={close}>
                Cancel
              </Button>
              <Button
                onClick={submit}
                disabled={
                  m.isPending ||
                  !form.accessKeyId ||
                  !form.secret ||
                  !form.bucket ||
                  endpointMissing
                }
              >
                {m.isPending && <Loader2 className="size-4 animate-spin" />}
                Test &amp; mount
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function Field({
  label,
  hint,
  help,
  error,
  children,
}: {
  label: string;
  hint?: string;
  /** Always-visible guidance under the input - tells the user exactly what to enter. */
  help?: string;
  /** Validation message under the input (overrides help when present). */
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-medium text-muted-foreground">
        {label}
        {hint && <span className="font-normal text-muted-foreground/70"> - {hint}</span>}
      </span>
      {children}
      {error ? (
        <span className="text-[11.5px] text-destructive">{error}</span>
      ) : (
        help && <span className="text-[11.5px] text-muted-foreground/70">{help}</span>
      )}
    </label>
  );
}
