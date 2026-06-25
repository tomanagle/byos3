import { createId } from "@byos3/core";
import { loadLanguage } from "@uiw/codemirror-extensions-langs";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import CodeMirror from "@uiw/react-codemirror";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, FileText, Loader2, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "#/components/ui/modal";
import { treeCommit, treeCommitIntent } from "#/fn/tree";
import { downloadUrl, uploadIntent } from "#/fn/volumes";
import { languageFor } from "#/lib/file-types";
import type { FileEntry } from "./inspector";

async function sha256OfText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * View and make small edits to a text/code file. Bytes move DIRECTLY to/from the user's bucket
 * (presigned GET to load, presigned PUT to save) - never through the worker. Saving re-hashes the
 * edited text, uploads it as a content-addressed block if new, then commits an `addVersion` op so
 * the file's history advances and every window sees it. See storage-byo-s3.md, sync-engine.md.
 */
export function FileViewer({
  file,
  volumeLabel,
  onClose,
}: {
  file: FileEntry;
  volumeLabel: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const lang = useMemo(() => {
    const name = languageFor(file.name);
    return name ? loadLanguage(name) : null;
  }, [file.name]);

  const content = useQuery({
    queryKey: ["file-content", file.volumeId, file.sha256],
    enabled: Boolean(file.volumeId && file.sha256),
    staleTime: Number.POSITIVE_INFINITY, // content-addressed: a hash's bytes never change
    queryFn: async () => {
      const { url } = await downloadUrl({
        data: { volumeId: file.volumeId as string, hash: file.sha256 as string },
      });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`couldn't load file (${res.status})`);
      return res.text();
    },
  });

  // `baseline` = last saved text; `draft` = what's in the editor. Both seeded once content loads.
  const [baseline, setBaseline] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [baseVersion, setBaseVersion] = useState<string | undefined>(
    file.currentVersionId ?? undefined,
  );
  useEffect(() => {
    if (content.data != null && baseline == null) {
      setBaseline(content.data);
      setDraft(content.data);
    }
  }, [content.data, baseline]);

  const dirty = baseline != null && draft !== baseline;

  const save = useMutation({
    mutationFn: async () => {
      if (!file.volumeId) throw new Error("no volume");
      const bytes = new TextEncoder().encode(draft);
      const hash = await sha256OfText(draft);
      const { missing } = await treeCommitIntent({
        data: { volumeId: file.volumeId, hashes: [hash] },
      });
      if (missing.includes(hash)) {
        const presigned = await uploadIntent({ data: { volumeId: file.volumeId, hash } });
        const res = await fetch(presigned.url, {
          method: "PUT",
          headers: presigned.headers,
          body: bytes,
        });
        if (!res.ok) throw new Error(`upload failed (${res.status})`);
      }
      const versionId = createId("ver");
      await treeCommit({
        data: {
          type: "addVersion",
          gid: file.gid,
          versionId,
          blocklist: [{ hash, size: bytes.length }],
          size: bytes.length,
          sha256: hash,
          baseVersionId: baseVersion,
        },
      });
      return { versionId, text: draft };
    },
    onSuccess: ({ versionId, text }) => {
      setBaseline(text);
      setBaseVersion(versionId);
      void qc.invalidateQueries({ queryKey: ["tree"] });
    },
  });

  function requestClose() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  }
  function download() {
    if (!file.volumeId || !file.sha256) return;
    void downloadUrl({ data: { volumeId: file.volumeId, hash: file.sha256 } }).then((p) => {
      if (typeof window !== "undefined") window.open(p.url, "_blank", "noopener");
    });
  }

  return (
    <Modal open onClose={requestClose} className="flex max-h-[90vh] max-w-4xl flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-base font-semibold">{file.name}</h3>
          <p className="truncate font-mono text-sm text-muted-foreground">in {volumeLabel}</p>
        </div>
        {dirty && <span className="text-sm text-amber-400">Unsaved changes</span>}
        <button
          type="button"
          onClick={download}
          title="Download original"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Download className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-50"
        >
          {save.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : save.isSuccess && !dirty ? (
            <Check className="size-3.5" />
          ) : (
            <Save className="size-3.5" />
          )}
          {save.isPending ? "Saving" : save.isSuccess && !dirty ? "Saved" : "Save"}
        </button>
        <button
          type="button"
          onClick={requestClose}
          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {content.isLoading ? (
          <div className="grid h-[60vh] place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : content.isError ? (
          <div className="grid h-[60vh] place-items-center px-6 text-center">
            <div>
              <p className="text-sm text-destructive">
                Couldn&apos;t load this file. The bucket may need a CORS policy allowing this app.
              </p>
              <button
                type="button"
                onClick={download}
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-secondary px-3.5 text-sm font-medium hover:bg-accent"
              >
                <Download className="size-4" /> Download instead
              </button>
            </div>
          </div>
        ) : (
          <CodeMirror
            value={draft}
            onChange={setDraft}
            theme={vscodeDark}
            extensions={lang ? [lang] : []}
            height="60vh"
            basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true }}
          />
        )}
      </div>

      {save.isError && (
        <div className="border-t border-border px-4 py-2 text-sm text-destructive">
          Couldn&apos;t save. You may not have write access to this volume.
        </div>
      )}
    </Modal>
  );
}
