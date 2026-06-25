import { useQuery } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { setupCors } from "#/fn/cors";

/**
 * After connecting, byos3 needs the bucket to allow this app's origin (browser→bucket transfers are
 * direct). We try to apply the CORS policy with the connector's credential; if we can't, we show the
 * exact policy for the user to paste into their provider's dashboard. See storage-byo-s3.md.
 */
export function CorsSetup({ volumeId }: { volumeId: string }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const q = useQuery({
    queryKey: ["cors-setup", volumeId, origin],
    queryFn: () => setupCors({ data: { volumeId, origins: [origin] } }),
    enabled: Boolean(volumeId && origin),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-3 text-sm text-muted-foreground">
        {q.isError ? (
          <span className="text-amber-400">
            Couldn&apos;t check CORS - you may need to allow <Code>{origin}</Code> on the bucket.
          </span>
        ) : (
          <>
            <Loader2 className="size-3.5 animate-spin" /> Setting up CORS for direct uploads…
          </>
        )}
      </div>
    );
  }

  if (q.data.applied) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-ok/30 bg-ok/10 px-3 py-3">
        <ShieldCheck className="mt-0.5 size-[18px] shrink-0 text-ok" />
        <p className="text-sm text-foreground/90">
          <span className="font-medium">CORS configured.</span> This app (<Code>{origin}</Code>) can
          upload and download directly from your bucket.
        </p>
      </div>
    );
  }

  return (
    <CorsManual
      origin={origin}
      json={q.data.policy.json}
      docsUrl={q.data.policy.docsUrl}
      reason={q.data.reason}
    />
  );
}

function CorsManual({
  origin,
  json,
  docsUrl,
  reason,
}: {
  origin: string;
  json: string;
  docsUrl?: string;
  reason?: string;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard?.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 size-[18px] shrink-0 text-amber-400" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">One step to enable uploads</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {reason ?? "Add this CORS policy to your bucket so this app can transfer files to it."}{" "}
            It allows <Code>{origin}</Code>.
          </p>
        </div>
      </div>

      <div className="relative mt-2.5">
        <pre className="max-h-44 overflow-auto rounded-md border border-border bg-background/70 p-2.5 font-mono text-xs leading-relaxed text-foreground/90">
          {json}
        </pre>
        <button
          type="button"
          onClick={copy}
          className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="size-3 text-ok" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {docsUrl && (
        <a
          href={docsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Where do I paste this? <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs text-foreground/90">
      {children}
    </code>
  );
}
