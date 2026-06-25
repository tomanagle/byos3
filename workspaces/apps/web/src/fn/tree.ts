import type { NodeRecord } from "@byos3/protocol";
import { CommitIntentInput, JournalOp, TreeAncestorsInput, TreeListInput } from "@byos3/protocol";
import { assertCan } from "@byos3/services";
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { authMiddleware } from "#/lib/middleware";

// Server functions that drive the per-namespace sync engine (the Namespace Durable Object). The DO
// is a single writer; the caller's namespace is resolved once in authMiddleware (context.namespaceId),
// these authorize then RPC the DO stub. See agents/docs/sync-engine.md.

/** A tree node as the canvas needs it - file nodes carry their current content (chunk + size). */
export type TreeEntry = NodeRecord & { sha256: string | null; size: number | null };

interface NamespaceStub {
  commit(op: JournalOp, actorDeviceId?: string | null): Promise<{ head: number }>;
  commitIntent(volumeId: string, hashes: string[]): Promise<{ missing: string[] }>;
  sync(cursor: number): Promise<{ head: number; ops: unknown[] }>;
  list(parentGid: string): Promise<TreeEntry[]>;
  ancestors(gid: string): Promise<Array<{ gid: string; name: string }>>;
}

function namespaceStub(namespaceId: string): NamespaceStub {
  const ns = (env as { NAMESPACE: DurableObjectNamespace }).NAMESPACE;
  return ns.get(ns.idFromName(namespaceId)) as unknown as NamespaceStub;
}

/** Every tree fn runs against the caller's primary namespace; bail loudly if they have none. */
function requireNamespace(namespaceId: string | null): string {
  if (!namespaceId) throw new Error("no namespace");
  return namespaceId;
}

export const treeList = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(TreeListInput)
  .handler(async ({ context, data }): Promise<TreeEntry[]> => {
    const nsId = requireNamespace(context.namespaceId);
    context.span.set({ fn: "treeList", "tree.parent_gid": data.parentGid });
    await assertCan(context.ctx, nsId, "file:read");
    const entries = await namespaceStub(nsId).list(data.parentGid);
    context.span.set({ "tree.entry_count": entries.length });
    return entries;
  });

export const treeAncestors = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(TreeAncestorsInput)
  .handler(async ({ context, data }): Promise<Array<{ gid: string; name: string }>> => {
    const nsId = requireNamespace(context.namespaceId);
    context.span.set({ fn: "treeAncestors", "tree.gid": data.gid });
    await assertCan(context.ctx, nsId, "file:read");
    const trail = await namespaceStub(nsId).ancestors(data.gid);
    context.span.set({ "tree.depth": trail.length });
    return trail;
  });

export const treeCommit = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(JournalOp)
  .handler(async ({ context, data }): Promise<{ head: number }> => {
    const nsId = requireNamespace(context.namespaceId);
    // createFolder/createFile/addVersion mutate content; the rest are structural - all need write.
    context.span.set({ fn: "treeCommit", "tree.op": data.type });
    await assertCan(context.ctx, nsId, data.type === "delete" ? "file:delete" : "file:create");
    const result = await namespaceStub(nsId).commit(data);
    context.span.set({ "tree.head": result.head });
    return result;
  });

export const treeCommitIntent = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(CommitIntentInput)
  .handler(async ({ context, data }): Promise<{ missing: string[] }> => {
    const nsId = requireNamespace(context.namespaceId);
    context.span.set({
      fn: "treeCommitIntent",
      "volume.id": data.volumeId,
      "tree.hash_count": data.hashes.length,
    });
    await assertCan(context.ctx, nsId, "file:create");
    const result = await namespaceStub(nsId).commitIntent(data.volumeId, data.hashes);
    context.span.set({ "tree.missing_count": result.missing.length });
    return result;
  });
