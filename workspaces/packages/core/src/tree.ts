import type { Blocklist, JournalOp } from "@byos3/protocol";
import { AppError } from "./errors";

/**
 * The pure, deterministic journal applier - the heart of the sync engine. Given the current tree
 * and one validated op, it returns the next tree + the side effects to persist, or throws an
 * `AppError` if the op would make the tree invalid. **Invalid trees are unrepresentable**: no op
 * may leave a node orphaned, duplicated, cyclic, or colliding by name (sync-engine.md §journal,
 * foundational-considerations.md §1/§6). This module is pure - no I/O - so the Namespace DO can
 * trust it and we can exhaust every rejection in unit tests.
 */

export const ROOT_GID = "root";

export interface TreeNode {
  gid: string;
  parentGid: string;
  name: string;
  type: "file" | "folder";
  volumeId: string | null;
  currentVersionId: string | null;
  /** Denormalized current-version content (files only) - the chunk to fetch + the file size. */
  sha256: string | null;
  size: number | null;
  deleted: boolean;
  updatedSeq: number;
}

export interface TreeState {
  nodes: Map<string, TreeNode>;
  headSeq: number;
}

export type Effect =
  | { kind: "node"; node: TreeNode }
  | {
      kind: "version";
      version: {
        id: string;
        nodeGid: string;
        blocklist: Blocklist;
        size: number;
        sha256: string;
        createdSeq: number;
      };
    }
  | { kind: "chunk"; volumeId: string; hash: string; size: number; delta: number };

export function emptyTree(): TreeState {
  return { nodes: new Map(), headSeq: 0 };
}

function liveSiblingClash(
  state: TreeState,
  parentGid: string,
  name: string,
  exceptGid?: string,
): boolean {
  for (const n of state.nodes.values()) {
    if (n.parentGid === parentGid && !n.deleted && n.name === name && n.gid !== exceptGid)
      return true;
  }
  return false;
}

/** A folder the op may write into: the synthetic root, or an existing live folder. */
function assertWritableParent(state: TreeState, parentGid: string): void {
  if (parentGid === ROOT_GID) return;
  const parent = state.nodes.get(parentGid);
  if (!parent || parent.deleted) throw new AppError("not_found", `parent ${parentGid}`);
  if (parent.type !== "folder") throw new AppError("scope_violation", "parent is not a folder");
}

function getLive(state: TreeState, gid: string): TreeNode {
  if (gid === ROOT_GID) throw new AppError("scope_violation", "cannot operate on root");
  const node = state.nodes.get(gid);
  if (!node || node.deleted) throw new AppError("not_found", `node ${gid}`);
  return node;
}

/** Walk up from `gid`; true if `maybeAncestor` is `gid` or one of its ancestors. */
function isSelfOrAncestor(state: TreeState, maybeAncestor: string, gid: string): boolean {
  let cur: string | undefined = maybeAncestor;
  const seen = new Set<string>();
  while (cur && cur !== ROOT_GID) {
    if (cur === gid) return true;
    if (seen.has(cur)) break; // defensive: never loop on already-corrupt state
    seen.add(cur);
    cur = state.nodes.get(cur)?.parentGid;
  }
  return false;
}

function clone(state: TreeState): TreeState {
  return { nodes: new Map(state.nodes), headSeq: state.headSeq };
}

function chunkEffects(blocklist: Blocklist, volumeId: string, delta: number): Effect[] {
  const seen = new Set<string>();
  const out: Effect[] = [];
  for (const c of blocklist) {
    if (seen.has(c.hash)) continue; // refcount once per version, even if a chunk repeats
    seen.add(c.hash);
    out.push({ kind: "chunk", volumeId, hash: c.hash, size: c.size, delta });
  }
  return out;
}

/**
 * Apply `op` (already Zod-validated) at logical clock `seq`. Returns the next state + effects to
 * persist. Throws `AppError` on any integrity violation - the DO rejects the commit, the journal is
 * untouched.
 */
export function applyOp(
  state: TreeState,
  op: JournalOp,
  seq: number,
): { state: TreeState; effects: Effect[] } {
  const next = clone(state);
  const effects: Effect[] = [];

  switch (op.type) {
    case "createFolder": {
      if (next.nodes.has(op.gid)) throw new AppError("conflict", `gid ${op.gid} exists`);
      assertWritableParent(next, op.parentGid);
      if (liveSiblingClash(next, op.parentGid, op.name))
        throw new AppError("conflict", `name "${op.name}" in use`);
      const node: TreeNode = {
        gid: op.gid,
        parentGid: op.parentGid,
        name: op.name,
        type: "folder",
        volumeId: null,
        currentVersionId: null,
        sha256: null,
        size: null,
        deleted: false,
        updatedSeq: seq,
      };
      next.nodes.set(node.gid, node);
      effects.push({ kind: "node", node });
      break;
    }

    case "createFile": {
      if (next.nodes.has(op.gid)) throw new AppError("conflict", `gid ${op.gid} exists`);
      assertWritableParent(next, op.parentGid);
      if (liveSiblingClash(next, op.parentGid, op.name))
        throw new AppError("conflict", `name "${op.name}" in use`);
      const node: TreeNode = {
        gid: op.gid,
        parentGid: op.parentGid,
        name: op.name,
        type: "file",
        volumeId: op.volumeId,
        currentVersionId: op.versionId,
        sha256: op.sha256,
        size: op.size,
        deleted: false,
        updatedSeq: seq,
      };
      next.nodes.set(node.gid, node);
      effects.push({ kind: "node", node });
      effects.push({
        kind: "version",
        version: {
          id: op.versionId,
          nodeGid: op.gid,
          blocklist: op.blocklist,
          size: op.size,
          sha256: op.sha256,
          createdSeq: seq,
        },
      });
      effects.push(...chunkEffects(op.blocklist, op.volumeId, 1));
      break;
    }

    case "addVersion": {
      const node = getLive(next, op.gid);
      if (node.type !== "file") throw new AppError("scope_violation", "not a file");
      if (node.volumeId === null) throw new AppError("scope_violation", "file has no volume");
      const updated: TreeNode = {
        ...node,
        currentVersionId: op.versionId,
        sha256: op.sha256,
        size: op.size,
        updatedSeq: seq,
      };
      next.nodes.set(node.gid, updated);
      effects.push({ kind: "node", node: updated });
      effects.push({
        kind: "version",
        version: {
          id: op.versionId,
          nodeGid: op.gid,
          blocklist: op.blocklist,
          size: op.size,
          sha256: op.sha256,
          createdSeq: seq,
        },
      });
      effects.push(...chunkEffects(op.blocklist, node.volumeId, 1));
      break;
    }

    case "rename": {
      const node = getLive(next, op.gid);
      if (node.name !== op.name && liveSiblingClash(next, node.parentGid, op.name, node.gid))
        throw new AppError("conflict", `name "${op.name}" in use`);
      const updated: TreeNode = { ...node, name: op.name, updatedSeq: seq };
      next.nodes.set(node.gid, updated);
      effects.push({ kind: "node", node: updated });
      break;
    }

    case "move": {
      const node = getLive(next, op.gid);
      assertWritableParent(next, op.newParentGid);
      if (isSelfOrAncestor(next, op.newParentGid, op.gid))
        throw new AppError("scope_violation", "cannot move a node into itself or a descendant");
      if (liveSiblingClash(next, op.newParentGid, node.name, node.gid))
        throw new AppError("conflict", `name "${node.name}" in use at destination`);
      const updated: TreeNode = { ...node, parentGid: op.newParentGid, updatedSeq: seq };
      next.nodes.set(node.gid, updated);
      effects.push({ kind: "node", node: updated });
      break;
    }

    case "delete": {
      const node = getLive(next, op.gid);
      // Tombstone the node and its whole live subtree (a delete never orphans live descendants).
      const stack = [node.gid];
      while (stack.length > 0) {
        const gid = stack.pop() as string;
        const cur = next.nodes.get(gid);
        if (!cur || cur.deleted) continue;
        const tomb: TreeNode = { ...cur, deleted: true, updatedSeq: seq };
        next.nodes.set(gid, tomb);
        effects.push({ kind: "node", node: tomb });
        for (const child of next.nodes.values()) {
          if (child.parentGid === gid && !child.deleted) stack.push(child.gid);
        }
      }
      break;
    }

    case "restore": {
      if (op.gid === ROOT_GID) throw new AppError("scope_violation", "cannot restore root");
      const node = next.nodes.get(op.gid);
      if (!node) throw new AppError("not_found", `node ${op.gid}`);
      if (!node.deleted) break; // already live - idempotent no-op
      // The parent must be live, or the restored node would be orphaned.
      if (node.parentGid !== ROOT_GID) {
        const parent = next.nodes.get(node.parentGid);
        if (!parent || parent.deleted) throw new AppError("conflict", "parent is deleted");
      }
      if (liveSiblingClash(next, node.parentGid, node.name, node.gid))
        throw new AppError("conflict", `name "${node.name}" in use`);
      const restored: TreeNode = { ...node, deleted: false, updatedSeq: seq };
      next.nodes.set(node.gid, restored);
      effects.push({ kind: "node", node: restored });
      break;
    }
  }

  next.headSeq = seq;
  return { state: next, effects };
}
