import { AppError, applyOp, type Effect, type TreeNode, type TreeState } from "@byos3/core";
import type { JournalEntry, JournalOp, NodeRecord } from "@byos3/protocol";
import { DurableObject } from "cloudflare:workers";

/**
 * The `Namespace` Durable Object - the single-writer sync engine for one namespace (≡ organization).
 * It owns the append-only journal + the materialized tree in its own SQLite, serializes every
 * mutation (so `seq` is a gap-free logical clock), and is the only thing that can validate ops
 * against the live tree. The pure applier (`@byos3/core`) does the validation; this class is the
 * durable shell. WebSocket fan-out lands in phase (b). See agents/docs/sync-engine.md, data-model.md.
 */
export class Namespace extends DurableObject {
  #tree: TreeState = { nodes: new Map(), headSeq: 0 };

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    ctx.blockConcurrencyWhile(async () => {
      this.#migrate();
      this.#loadTree();
    });
  }

  get #sql() {
    return this.ctx.storage.sql;
  }

  #migrate(): void {
    this.#sql.exec(`
      CREATE TABLE IF NOT EXISTS journal (
        seq INTEGER PRIMARY KEY,
        op TEXT NOT NULL,
        actorDeviceId TEXT,
        ts INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS node (
        gid TEXT PRIMARY KEY,
        parentGid TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        volumeId TEXT,
        currentVersionId TEXT,
        sha256 TEXT,
        size INTEGER,
        deleted INTEGER NOT NULL DEFAULT 0,
        updatedSeq INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS node_parent ON node (parentGid);
      CREATE TABLE IF NOT EXISTS version (
        id TEXT PRIMARY KEY,
        nodeGid TEXT NOT NULL,
        blocklist TEXT NOT NULL,
        size INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        createdSeq INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chunk_index (
        volumeId TEXT NOT NULL,
        hash TEXT NOT NULL,
        size INTEGER NOT NULL,
        refcount INTEGER NOT NULL,
        PRIMARY KEY (volumeId, hash)
      );
      CREATE TABLE IF NOT EXISTS usage (
        period TEXT PRIMARY KEY,   -- YYYY-MM (UTC); the cost-guardrail counter resets each month
        ops INTEGER NOT NULL
      );
    `);
  }

  // ── Operation budget (the Cloudflare-cost guardrail, billing.md) ─────────────────────────────────
  // We meter mutating commits per UTC month and reject past the namespace's plan budget. The Worker
  // resolves the entitlement (free vs paid) and passes the budget in; the DO is the single writer, so
  // this counter is naturally per-namespace and race-free. budget < 0 means unlimited (paid).
  #currentPeriod(): string {
    return new Date().toISOString().slice(0, 7); // "2026-06"
  }

  #opsThisPeriod(): number {
    const rows = this.#sql
      .exec("SELECT ops FROM usage WHERE period = ?", this.#currentPeriod())
      .toArray();
    return rows.length ? Number(rows[0].ops) : 0;
  }

  #assertOpsBudget(budget: number): void {
    if (budget < 0) return; // unlimited
    if (this.#opsThisPeriod() >= budget) {
      throw new AppError(
        "limit_exceeded",
        `monthly operation budget (${budget}) reached - upgrade for more`,
      );
    }
  }

  #loadTree(): void {
    const nodes = new Map<string, TreeNode>();
    for (const r of this.#sql.exec("SELECT * FROM node").toArray()) {
      nodes.set(r.gid as string, {
        gid: r.gid as string,
        parentGid: r.parentGid as string,
        name: r.name as string,
        type: r.type as "file" | "folder",
        volumeId: (r.volumeId as string | null) ?? null,
        currentVersionId: (r.currentVersionId as string | null) ?? null,
        sha256: (r.sha256 as string | null) ?? null,
        size: r.size == null ? null : Number(r.size),
        deleted: Number(r.deleted) === 1,
        updatedSeq: Number(r.updatedSeq),
      });
    }
    const head = this.#sql.exec("SELECT COALESCE(MAX(seq), 0) AS head FROM journal").one();
    this.#tree = { nodes, headSeq: Number(head.head) };
  }

  #persist(effect: Effect): void {
    if (effect.kind === "node") {
      const n = effect.node;
      this.#sql.exec(
        `INSERT INTO node (gid, parentGid, name, type, volumeId, currentVersionId, sha256, size, deleted, updatedSeq)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(gid) DO UPDATE SET
           parentGid=excluded.parentGid, name=excluded.name, type=excluded.type,
           volumeId=excluded.volumeId, currentVersionId=excluded.currentVersionId,
           sha256=excluded.sha256, size=excluded.size,
           deleted=excluded.deleted, updatedSeq=excluded.updatedSeq`,
        n.gid,
        n.parentGid,
        n.name,
        n.type,
        n.volumeId,
        n.currentVersionId,
        n.sha256,
        n.size,
        n.deleted ? 1 : 0,
        n.updatedSeq,
      );
    } else if (effect.kind === "version") {
      const v = effect.version;
      this.#sql.exec(
        "INSERT OR IGNORE INTO version (id, nodeGid, blocklist, size, sha256, createdSeq) VALUES (?, ?, ?, ?, ?, ?)",
        v.id,
        v.nodeGid,
        JSON.stringify(v.blocklist),
        v.size,
        v.sha256,
        v.createdSeq,
      );
    } else {
      this.#sql.exec(
        `INSERT INTO chunk_index (volumeId, hash, size, refcount) VALUES (?, ?, ?, ?)
         ON CONFLICT(volumeId, hash) DO UPDATE SET refcount = refcount + excluded.refcount`,
        effect.volumeId,
        effect.hash,
        effect.size,
        effect.delta,
      );
    }
  }

  /** Apply one op: validate against the live tree, append to the journal, materialize. Returns the
   *  new head seq. Throws the applier's AppError (mapped to HTTP by the caller) on an invalid op, or
   *  `limit_exceeded` when the namespace is past its monthly operation budget (`opsBudget`; `-1` =
   *  unlimited - the Worker passes the plan's budget, billing.md). */
  async commit(
    op: JournalOp,
    actorDeviceId: string | null = null,
    opsBudget = -1,
  ): Promise<{ head: number }> {
    this.#assertOpsBudget(opsBudget); // cost guardrail - reject before doing any work
    const seq = this.#tree.headSeq + 1;
    const { state, effects } = applyOp(this.#tree, op, seq); // throws on invalid → journal untouched

    this.ctx.storage.transactionSync(() => {
      this.#sql.exec(
        "INSERT INTO journal (seq, op, actorDeviceId, ts) VALUES (?, ?, ?, ?)",
        seq,
        JSON.stringify(op),
        actorDeviceId,
        Date.now(),
      );
      for (const effect of effects) this.#persist(effect);
      // Count this successful mutation against the month's budget (atomic with the journal append).
      this.#sql.exec(
        "INSERT INTO usage (period, ops) VALUES (?, 1) ON CONFLICT(period) DO UPDATE SET ops = ops + 1",
        this.#currentPeriod(),
      );
    });

    this.#tree = state;
    // Durable poke: tell every connected client the head advanced; they pull deltas via cursor.
    this.#broadcast(JSON.stringify({ type: "poke", head: seq }));
    return { head: seq };
  }

  // ── Live WebSockets (hibernatable) - change notification + ephemeral transfer presence ──────────

  /** WS upgrade. The Worker authenticates + authorizes BEFORE forwarding here and passes the
   *  principal via `x-byos3-user`; the DO trusts it (same security domain - rbac.md). */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("expected a websocket upgrade", { status: 426 });
    }
    const userId = request.headers.get("x-byos3-user") ?? "unknown";
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server); // hibernation API - idle sockets cost nothing
    server.serializeAttachment({ userId });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string") return;
    let msg: { type?: unknown };
    try {
      msg = JSON.parse(message) as { type?: unknown };
    } catch {
      return;
    }
    // Ephemeral transfer presence/progress - relayed to other clients, NEVER journaled.
    if (typeof msg.type === "string" && msg.type.startsWith("transfer.")) {
      const by = (ws.deserializeAttachment() as { userId?: string } | null)?.userId ?? "unknown";
      this.#broadcast(JSON.stringify({ ...msg, by }), ws);
    }
  }

  webSocketClose(ws: WebSocket, code: number): void {
    try {
      ws.close(code, "bye");
    } catch {
      // already closing
    }
  }

  #broadcast(data: string, exclude?: WebSocket): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      try {
        ws.send(data);
      } catch {
        // socket is closing - hibernation will reap it
      }
    }
  }

  /** Two-phase commit step 1: which of these chunks does the volume not already have? */
  async commitIntent(volumeId: string, hashes: string[]): Promise<{ missing: string[] }> {
    const missing: string[] = [];
    for (const hash of new Set(hashes)) {
      const row = this.#sql
        .exec(
          "SELECT 1 AS present FROM chunk_index WHERE volumeId = ? AND hash = ? LIMIT 1",
          volumeId,
          hash,
        )
        .toArray();
      if (row.length === 0) missing.push(hash);
    }
    return { missing };
  }

  /** Cursor pull: every op with seq > cursor, plus the current head. */
  async sync(cursor: number): Promise<{ head: number; ops: JournalEntry[] }> {
    const rows = this.#sql
      .exec("SELECT seq, op, actorDeviceId, ts FROM journal WHERE seq > ? ORDER BY seq", cursor)
      .toArray();
    const ops: JournalEntry[] = rows.map((r) => ({
      seq: Number(r.seq),
      op: JSON.parse(r.op as string) as JournalOp,
      actorDeviceId: (r.actorDeviceId as string | null) ?? null,
      ts: Number(r.ts),
    }));
    return { head: this.#tree.headSeq, ops };
  }

  /** Live children of `parentGid` (folders first), each with its current content (files). */
  async list(
    parentGid: string,
  ): Promise<Array<NodeRecord & { sha256: string | null; size: number | null }>> {
    const rows = this.#sql
      .exec(
        "SELECT * FROM node WHERE parentGid = ? AND deleted = 0 ORDER BY type DESC, name",
        parentGid,
      )
      .toArray();
    return rows.map((r) => ({
      gid: r.gid as string,
      parentGid: r.parentGid as string,
      name: r.name as string,
      type: r.type as "file" | "folder",
      volumeId: (r.volumeId as string | null) ?? null,
      currentVersionId: (r.currentVersionId as string | null) ?? null,
      sha256: (r.sha256 as string | null) ?? null,
      size: r.size == null ? null : Number(r.size),
      deleted: false,
      updatedSeq: Number(r.updatedSeq),
    }));
  }

  /** The ancestor chain root→folder (exclusive of the synthetic root) for breadcrumbs. In-memory. */
  async ancestors(gid: string): Promise<Array<{ gid: string; name: string }>> {
    const chain: Array<{ gid: string; name: string }> = [];
    let cur = this.#tree.nodes.get(gid);
    const seen = new Set<string>();
    while (cur && !seen.has(cur.gid)) {
      seen.add(cur.gid);
      chain.push({ gid: cur.gid, name: cur.name });
      cur = cur.parentGid === "root" ? undefined : this.#tree.nodes.get(cur.parentGid);
    }
    return chain.toReversed();
  }
}
