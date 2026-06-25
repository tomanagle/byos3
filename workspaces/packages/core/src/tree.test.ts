import type { JournalOp } from "@byos3/protocol";
import { describe, expect, test } from "bun:test";
import { applyOp, emptyTree, ROOT_GID, type TreeState } from "./tree";

const HASH = "a".repeat(64);

function run(ops: JournalOp[], start: TreeState = emptyTree()): TreeState {
  let state = start;
  let seq = state.headSeq;
  for (const op of ops) {
    seq += 1;
    state = applyOp(state, op, seq).state;
  }
  return state;
}

const folder = (gid: string, name: string, parentGid = ROOT_GID): JournalOp => ({
  type: "createFolder",
  gid,
  parentGid,
  name,
});
const file = (gid: string, name: string, parentGid = ROOT_GID): JournalOp => ({
  type: "createFile",
  gid,
  parentGid,
  name,
  volumeId: "vol_1",
  versionId: `ver_${gid}_1`,
  blocklist: [{ hash: HASH, size: 10 }],
  size: 10,
  sha256: HASH,
});

function expectThrows(fn: () => unknown): void {
  expect(fn).toThrow();
}

describe("applyOp - valid sequences", () => {
  test("creates folders and files under root + advances headSeq", () => {
    const s = run([folder("node_a", "Docs"), file("node_b", "readme.md")]);
    expect(s.headSeq).toBe(2);
    expect(s.nodes.get("node_a")?.type).toBe("folder");
    expect(s.nodes.get("node_b")?.type).toBe("file");
    expect(s.nodes.get("node_b")?.currentVersionId).toBe("ver_node_b_1");
  });

  test("createFile emits a version effect + chunk refcount", () => {
    const { effects } = applyOp(emptyTree(), file("node_b", "x.bin"), 1);
    expect(effects.some((e) => e.kind === "version")).toBe(true);
    const chunk = effects.find((e) => e.kind === "chunk");
    expect(chunk).toMatchObject({ kind: "chunk", volumeId: "vol_1", hash: HASH, delta: 1 });
  });

  test("rename, then reuse the freed name", () => {
    let s = run([file("node_a", "a.txt")]);
    s = applyOp(s, { type: "rename", gid: "node_a", name: "b.txt" }, s.headSeq + 1).state;
    expect(s.nodes.get("node_a")?.name).toBe("b.txt");
    // the old name "a.txt" is now free
    s = applyOp(s, file("node_c", "a.txt"), s.headSeq + 1).state;
    expect(s.nodes.get("node_c")?.name).toBe("a.txt");
  });

  test("move into a folder", () => {
    let s = run([folder("node_dir", "Dir"), file("node_f", "f.txt")]);
    s = applyOp(s, { type: "move", gid: "node_f", newParentGid: "node_dir" }, s.headSeq + 1).state;
    expect(s.nodes.get("node_f")?.parentGid).toBe("node_dir");
  });

  test("delete tombstones the whole subtree", () => {
    let s = run([folder("node_dir", "Dir"), file("node_f", "f.txt", "node_dir")]);
    s = applyOp(s, { type: "delete", gid: "node_dir" }, s.headSeq + 1).state;
    expect(s.nodes.get("node_dir")?.deleted).toBe(true);
    expect(s.nodes.get("node_f")?.deleted).toBe(true);
  });

  test("restore brings a node back when its parent is live", () => {
    let s = run([file("node_a", "a.txt")]);
    s = applyOp(s, { type: "delete", gid: "node_a" }, s.headSeq + 1).state;
    s = applyOp(s, { type: "restore", gid: "node_a" }, s.headSeq + 1).state;
    expect(s.nodes.get("node_a")?.deleted).toBe(false);
  });

  test("addVersion updates currentVersionId + refcounts the new chunks", () => {
    let s = run([file("node_a", "a.bin")]);
    const h2 = "b".repeat(64);
    const { state, effects } = applyOp(
      s,
      {
        type: "addVersion",
        gid: "node_a",
        versionId: "ver_node_a_2",
        blocklist: [{ hash: h2, size: 20 }],
        size: 20,
        sha256: h2,
      },
      s.headSeq + 1,
    );
    expect(state.nodes.get("node_a")?.currentVersionId).toBe("ver_node_a_2");
    expect(effects.find((e) => e.kind === "chunk")).toMatchObject({ hash: h2, delta: 1 });
  });
});

describe("applyOp - invalid trees are unrepresentable", () => {
  test("rejects a child under a missing parent (no orphans)", () => {
    expectThrows(() => applyOp(emptyTree(), folder("node_a", "x", "node_ghost"), 1));
  });

  test("rejects a child under a file (parent must be a folder)", () => {
    const s = run([file("node_file", "f.txt")]);
    expectThrows(() => applyOp(s, folder("node_a", "x", "node_file"), s.headSeq + 1));
  });

  test("rejects a duplicate name among live siblings", () => {
    const s = run([file("node_a", "dup.txt")]);
    expectThrows(() => applyOp(s, file("node_b", "dup.txt"), s.headSeq + 1));
  });

  test("rejects a duplicate gid", () => {
    const s = run([folder("node_a", "x")]);
    expectThrows(() => applyOp(s, folder("node_a", "y"), s.headSeq + 1));
  });

  test("rejects moving a node into itself", () => {
    const s = run([folder("node_a", "A")]);
    expectThrows(() =>
      applyOp(s, { type: "move", gid: "node_a", newParentGid: "node_a" }, s.headSeq + 1),
    );
  });

  test("rejects moving a folder into its own descendant (no cycles)", () => {
    const s = run([folder("node_a", "A"), folder("node_b", "B", "node_a")]);
    expectThrows(() =>
      applyOp(s, { type: "move", gid: "node_a", newParentGid: "node_b" }, s.headSeq + 1),
    );
  });

  test("rejects rename onto an existing sibling name", () => {
    const s = run([file("node_a", "a.txt"), file("node_b", "b.txt")]);
    expectThrows(() => applyOp(s, { type: "rename", gid: "node_b", name: "a.txt" }, s.headSeq + 1));
  });

  test("rejects operating on a deleted node", () => {
    let s = run([file("node_a", "a.txt")]);
    s = applyOp(s, { type: "delete", gid: "node_a" }, s.headSeq + 1).state;
    expectThrows(() => applyOp(s, { type: "rename", gid: "node_a", name: "z.txt" }, s.headSeq + 1));
  });

  test("rejects operating on the root", () => {
    expectThrows(() => applyOp(emptyTree(), { type: "delete", gid: ROOT_GID }, 1));
  });

  test("rejects restore when the parent is deleted", () => {
    let s = run([folder("node_dir", "Dir"), file("node_f", "f.txt", "node_dir")]);
    s = applyOp(s, { type: "delete", gid: "node_dir" }, s.headSeq + 1).state; // tombstones both
    expectThrows(() => applyOp(s, { type: "restore", gid: "node_f" }, s.headSeq + 1));
  });

  test("does not mutate the input state (pure)", () => {
    const s0 = run([folder("node_a", "A")]);
    const before = s0.nodes.get("node_a")?.name;
    applyOp(s0, { type: "rename", gid: "node_a", name: "renamed" }, s0.headSeq + 1);
    expect(s0.nodes.get("node_a")?.name).toBe(before); // original untouched
  });
});
