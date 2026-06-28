import { and, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import {
  AppError,
  Connector,
  Volume,
  createId,
  type ActiveSubscription,
  type ConnectorRepository,
  type DriverFactory,
  type MembershipResolver,
  type NamespaceMembership,
  type ResourceAccessRepository,
  type ResourceMember,
  type SubscriptionResolver,
  type Vault,
  type VolumeRepository,
} from "@byos3/core";
import type { ResourceRole, Role } from "@byos3/core/authz";
import { ConnectorRecord, VolumeRecord } from "@byos3/protocol";
import {
  connector as connectorTbl,
  connectorMember as connectorMemberTbl,
  volume as volumeTbl,
  volumeMember as volumeMemberTbl,
} from "./schema";
import {
  member as memberTbl,
  organization as orgTbl,
  subscription as subscriptionTbl,
  user as userTbl,
} from "./auth-schema";

type DB = DrizzleD1Database<Record<string, never>>;

// Pure data-access. Orchestration/authz lives in @byos3/services. Shared by both Workers
// (apps/web, apps/api) so the persistence layer is written once. See code-architecture.md.

export class D1ConnectorRepository implements ConnectorRepository {
  constructor(
    private readonly db: DB,
    private readonly vault: Vault,
    private readonly driverFactory: DriverFactory,
  ) {}

  async get(id: string): Promise<Connector> {
    const rows = await this.db.select().from(connectorTbl).where(eq(connectorTbl.id, id)).limit(1);
    if (rows.length === 0) throw new AppError("not_found", `connector ${id}`);
    return new Connector(ConnectorRecord.parse(rows[0]), {
      vault: this.vault,
      driverFactory: this.driverFactory,
    });
  }

  async insert(record: ConnectorRecord): Promise<void> {
    await this.db.insert(connectorTbl).values(record);
  }
}

export class D1VolumeRepository implements VolumeRepository {
  constructor(
    private readonly db: DB,
    private readonly connectors: D1ConnectorRepository,
  ) {}

  async get(id: string): Promise<Volume> {
    const rows = await this.db.select().from(volumeTbl).where(eq(volumeTbl.id, id)).limit(1);
    if (rows.length === 0) throw new AppError("not_found", `volume ${id}`);
    const record = VolumeRecord.parse(rows[0]);
    return new Volume(record, { connector: await this.connectors.get(record.connectorId) });
  }

  async insert(record: VolumeRecord): Promise<void> {
    await this.db.insert(volumeTbl).values(record);
  }

  async listByNamespace(namespaceId: string): Promise<VolumeRecord[]> {
    const rows = await this.db
      .select()
      .from(volumeTbl)
      .where(eq(volumeTbl.namespaceId, namespaceId));
    return rows.map((r) => VolumeRecord.parse(r));
  }

  async namespaceOf(volumeId: string): Promise<string | null> {
    const rows = await this.db
      .select({ namespaceId: volumeTbl.namespaceId })
      .from(volumeTbl)
      .where(eq(volumeTbl.id, volumeId))
      .limit(1);
    return rows.length ? rows[0].namespaceId : null;
  }
}

export class D1MembershipRepository implements MembershipResolver {
  constructor(private readonly db: DB) {}

  async roleFor(userId: string, namespaceId: string): Promise<Role | null> {
    const rows = await this.db
      .select()
      .from(memberTbl)
      .where(and(eq(memberTbl.userId, userId), eq(memberTbl.organizationId, namespaceId)))
      .limit(1);
    return rows.length ? (rows[0].role as Role) : null;
  }

  async listNamespaces(userId: string): Promise<NamespaceMembership[]> {
    const rows = await this.db
      .select({ id: orgTbl.id, name: orgTbl.name, slug: orgTbl.slug, role: memberTbl.role })
      .from(memberTbl)
      .innerJoin(orgTbl, eq(orgTbl.id, memberTbl.organizationId))
      .where(eq(memberTbl.userId, userId));
    return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, role: r.role as Role }));
  }

  async namespaceOwner(namespaceId: string): Promise<string | null> {
    const rows = await this.db
      .select({ userId: memberTbl.userId })
      .from(memberTbl)
      .where(and(eq(memberTbl.organizationId, namespaceId), eq(memberTbl.role, "owner")))
      .limit(1);
    return rows.length ? rows[0].userId : null;
  }

  async memberCount(namespaceId: string): Promise<number> {
    const rows = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(memberTbl)
      .where(eq(memberTbl.organizationId, namespaceId));
    return rows.length ? Number(rows[0].n) : 0;
  }
}

/** Reads the Better Auth `subscription` table to decide a namespace's entitlement (billing.md). */
export class D1SubscriptionRepository implements SubscriptionResolver {
  constructor(private readonly db: DB) {}

  async activeSubscription(namespaceId: string): Promise<ActiveSubscription | null> {
    // `referenceId` is the org/namespace id; an active OR trialing sub unlocks the paid limits.
    const rows = await this.db
      .select({ status: subscriptionTbl.status, seats: subscriptionTbl.seats })
      .from(subscriptionTbl)
      .where(eq(subscriptionTbl.referenceId, namespaceId));
    const live = rows.find((r) => r.status === "active" || r.status === "trialing");
    return live ? { seats: live.seats ?? 1 } : null;
  }
}

export class D1ResourceAccessRepository implements ResourceAccessRepository {
  constructor(private readonly db: DB) {}

  async volumeRoleFor(userId: string, volumeId: string): Promise<ResourceRole | null> {
    const rows = await this.db
      .select({ role: volumeMemberTbl.role })
      .from(volumeMemberTbl)
      .where(and(eq(volumeMemberTbl.userId, userId), eq(volumeMemberTbl.volumeId, volumeId)))
      .limit(1);
    return rows.length ? (rows[0].role as ResourceRole) : null;
  }

  async connectorRoleFor(userId: string, connectorId: string): Promise<ResourceRole | null> {
    const rows = await this.db
      .select({ role: connectorMemberTbl.role })
      .from(connectorMemberTbl)
      .where(
        and(eq(connectorMemberTbl.userId, userId), eq(connectorMemberTbl.connectorId, connectorId)),
      )
      .limit(1);
    return rows.length ? (rows[0].role as ResourceRole) : null;
  }

  async listAccessibleVolumes(userId: string): Promise<VolumeRecord[]> {
    const memberRows = await this.db
      .select({ volumeId: volumeMemberTbl.volumeId })
      .from(volumeMemberTbl)
      .where(eq(volumeMemberTbl.userId, userId));
    const ids = memberRows.map((r) => r.volumeId);
    if (ids.length === 0) return [];
    const rows = await this.db.select().from(volumeTbl).where(inArray(volumeTbl.id, ids));
    return rows.map((r) => VolumeRecord.parse(r));
  }

  async addVolumeMember(volumeId: string, userId: string, role: ResourceRole): Promise<void> {
    await this.db
      .insert(volumeMemberTbl)
      .values({ id: createId("vmem"), volumeId, userId, role, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: [volumeMemberTbl.volumeId, volumeMemberTbl.userId],
        set: { role },
      });
  }

  async removeVolumeMember(volumeId: string, userId: string): Promise<void> {
    await this.db
      .delete(volumeMemberTbl)
      .where(and(eq(volumeMemberTbl.volumeId, volumeId), eq(volumeMemberTbl.userId, userId)));
  }

  async listVolumeMembers(volumeId: string): Promise<ResourceMember[]> {
    const rows = await this.db
      .select({
        userId: volumeMemberTbl.userId,
        role: volumeMemberTbl.role,
        email: userTbl.email,
        name: userTbl.name,
      })
      .from(volumeMemberTbl)
      .innerJoin(userTbl, eq(userTbl.id, volumeMemberTbl.userId))
      .where(eq(volumeMemberTbl.volumeId, volumeId));
    return rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      name: r.name,
      role: r.role as ResourceRole,
    }));
  }

  async addConnectorMember(connectorId: string, userId: string, role: ResourceRole): Promise<void> {
    await this.db
      .insert(connectorMemberTbl)
      .values({ id: createId("cmem"), connectorId, userId, role, createdAt: Date.now() })
      .onConflictDoUpdate({
        target: [connectorMemberTbl.connectorId, connectorMemberTbl.userId],
        set: { role },
      });
  }

  async userByEmail(email: string): Promise<{ id: string; email: string; name: string } | null> {
    const normalized = email.trim().toLowerCase();
    const rows = await this.db
      .select({ id: userTbl.id, email: userTbl.email, name: userTbl.name })
      .from(userTbl)
      .where(eq(userTbl.email, normalized))
      .limit(1);
    return rows.length ? rows[0] : null;
  }
}
