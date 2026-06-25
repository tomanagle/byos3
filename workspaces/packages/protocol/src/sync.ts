import { z } from "zod";
import { Sha256 } from "./storage";

// The sync engine's wire vocabulary - the journal op union + materialized records + cursor DTOs.
// The DO validates every op against this union before it touches the journal. See
// agents/docs/sync-engine.md, data-model.md.

export const NodeType = z.enum(["file", "folder"]);
export type NodeType = z.infer<typeof NodeType>;

/** A file's content = an ordered list of content-addressed chunks. */
export const Blocklist = z.array(z.object({ hash: Sha256, size: z.number().int().nonnegative() }));
export type Blocklist = z.infer<typeof Blocklist>;

const Name = z
  .string()
  .min(1)
  .max(255)
  .refine((n) => !n.includes("/") && n !== "." && n !== "..", {
    message: "invalid name",
  });

// ── Journal ops (discriminated on `type`) ────────────────────────────────────
export const CreateFolderOp = z.object({
  type: z.literal("createFolder"),
  gid: z.string().min(1),
  parentGid: z.string().min(1),
  name: Name,
});
export const CreateFileOp = z.object({
  type: z.literal("createFile"),
  gid: z.string().min(1),
  parentGid: z.string().min(1),
  name: Name,
  volumeId: z.string().min(1),
  versionId: z.string().min(1),
  blocklist: Blocklist,
  size: z.number().int().nonnegative(),
  sha256: z.string(),
});
export const AddVersionOp = z.object({
  type: z.literal("addVersion"),
  gid: z.string().min(1),
  versionId: z.string().min(1),
  blocklist: Blocklist,
  size: z.number().int().nonnegative(),
  sha256: z.string(),
  /** The version the client edited from; a mismatch with the node's head is a conflict. */
  baseVersionId: z.string().optional(),
});
export const RenameOp = z.object({ type: z.literal("rename"), gid: z.string().min(1), name: Name });
export const MoveOp = z.object({
  type: z.literal("move"),
  gid: z.string().min(1),
  newParentGid: z.string().min(1),
});
export const DeleteOp = z.object({ type: z.literal("delete"), gid: z.string().min(1) });
export const RestoreOp = z.object({ type: z.literal("restore"), gid: z.string().min(1) });

export const JournalOp = z.discriminatedUnion("type", [
  CreateFolderOp,
  CreateFileOp,
  AddVersionOp,
  RenameOp,
  MoveOp,
  DeleteOp,
  RestoreOp,
]);
export type JournalOp = z.infer<typeof JournalOp>;
export type JournalOpType = JournalOp["type"];

// ── Materialized records ─────────────────────────────────────────────────────
export const NodeRecord = z.object({
  gid: z.string(),
  parentGid: z.string(),
  name: z.string(),
  type: NodeType,
  volumeId: z.string().nullable(),
  currentVersionId: z.string().nullable(),
  deleted: z.boolean(),
  updatedSeq: z.number().int(),
});
export type NodeRecord = z.infer<typeof NodeRecord>;

export const VersionRecord = z.object({
  id: z.string(),
  nodeGid: z.string(),
  blocklist: Blocklist,
  size: z.number().int().nonnegative(),
  sha256: z.string(),
  createdSeq: z.number().int(),
});
export type VersionRecord = z.infer<typeof VersionRecord>;

export const JournalEntry = z.object({
  seq: z.number().int(),
  op: JournalOp,
  actorDeviceId: z.string().nullable(),
  ts: z.number().int(),
});
export type JournalEntry = z.infer<typeof JournalEntry>;

// ── Sync / commit DTOs ───────────────────────────────────────────────────────
export const CommitResult = z.object({ head: z.number().int() });
export type CommitResult = z.infer<typeof CommitResult>;

export const SyncResult = z.object({ head: z.number().int(), ops: z.array(JournalEntry) });
export type SyncResult = z.infer<typeof SyncResult>;

export const CommitIntentResult = z.object({ missing: z.array(Sha256) });
export type CommitIntentResult = z.infer<typeof CommitIntentResult>;

// ── Web server-function inputs (tree) ────────────────────────────────────────
// Validation source for the web `tree*` server fns. They drive the Namespace DO, so there is no
// apps/api counterpart yet - but the schemas live here so the web app never imports zod directly.

/** List the children of a folder node (web `treeList` server fn). */
export const TreeListInput = z.object({ parentGid: z.string().default("root") });
export type TreeListInput = z.infer<typeof TreeListInput>;

/** Resolve the breadcrumb trail from root to a node (web `treeAncestors` server fn). */
export const TreeAncestorsInput = z.object({ gid: z.string().min(1) });
export type TreeAncestorsInput = z.infer<typeof TreeAncestorsInput>;

/** Ask which of a set of content hashes the bucket is still missing (web `treeCommitIntent` fn). */
export const CommitIntentInput = z.object({
  volumeId: z.string().min(1),
  hashes: z.array(Sha256),
});
export type CommitIntentInput = z.infer<typeof CommitIntentInput>;
