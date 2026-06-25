import { RESOURCE_ROLES, type ResourceRole } from "@byos3/core/authz";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

/**
 * Phase 0 waitlist. The only table not tied to a user/namespace - captures landing-page
 * interest before the product exists. See agents/docs/data-model.md (`waitlist`).
 */
export const waitlist = sqliteTable("waitlist", {
  id: text("id").primaryKey(),
  /** Normalized (trimmed + lowercased), unique. */
  email: text("email").notNull().unique(),
  name: text("name"),
  referrer: text("referrer"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type WaitlistRow = typeof waitlist.$inferSelect;

/** A connected provider credential (`secretCipher` is vault-sealed). See data-model.md / rbac.md. */
export const connector = sqliteTable("connector", {
  id: text("id").primaryKey(),
  /** The user who supplied the credential (FK to the Better Auth user). */
  ownerUserId: text("owner_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  endpoint: text("endpoint").notNull(),
  region: text("region").notNull(),
  accessKeyId: text("access_key_id").notNull(),
  secretCipher: text("secret_cipher").notNull(),
  label: text("label").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** A mountable drive = connector + bucket + prefix. `namespaceId` is its sync/DO home (storage),
 * NOT its access boundary - access is per-volume via `volumeMember`. See rbac.md. */
export const volume = sqliteTable("volume", {
  id: text("id").primaryKey(),
  connectorId: text("connector_id").notNull(),
  namespaceId: text("namespace_id").notNull(),
  bucket: text("bucket").notNull(),
  prefix: text("prefix").notNull(),
  label: text("label").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});

// Resource-level sharing (rbac.md): a user has a role on a specific connector/volume. The owner is
// seeded as a `full` member on create; sharing adds rows. role = full | read_write | read_only.

/** Who can access/manage a connector (the credential). */
export const connectorMember = sqliteTable(
  "connector_member",
  {
    id: text("id").primaryKey(),
    connectorId: text("connector_id")
      .notNull()
      .references(() => connector.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: RESOURCE_ROLES }).$type<ResourceRole>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("connector_member_unique").on(t.connectorId, t.userId)],
);

export type ConnectorMemberRow = typeof connectorMember.$inferSelect;

/** Who can access/manage a volume (a drive). The unit users get invited to. */
export const volumeMember = sqliteTable(
  "volume_member",
  {
    id: text("id").primaryKey(),
    volumeId: text("volume_id")
      .notNull()
      .references(() => volume.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: RESOURCE_ROLES }).$type<ResourceRole>().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("volume_member_unique").on(t.volumeId, t.userId)],
);

export type VolumeMemberRow = typeof volumeMember.$inferSelect;
