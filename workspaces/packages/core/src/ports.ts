import type { DriverConfig, StorageDriver } from "@byos3/s3";
import type { ConnectorRecord, VolumeRecord } from "@byos3/protocol";
import type { Connector } from "./connector";
import type { Volume } from "./volume";
import type { ResourceRole, Role } from "./authz";

/** Credential vault (implemented by @byos3/crypto's CredentialVault). */
export interface Vault {
  seal(plaintext: string): Promise<string>;
  open(cipher: string): Promise<string>;
}

/** Builds a StorageDriver from a config (production impl is @byos3/s3's `createDriver`). */
export type DriverFactory = (config: DriverConfig) => StorageDriver;

/** Repository ports - concrete D1 implementations live in the apps (pure data-access). */
export interface ConnectorRepository {
  get(id: string): Promise<Connector>;
  insert(record: ConnectorRecord): Promise<void>;
}
export interface VolumeRepository {
  get(id: string): Promise<Volume>;
  insert(record: VolumeRecord): Promise<void>;
  listByNamespace(namespaceId: string): Promise<VolumeRecord[]>;
  /** The volume's owning namespace id, without opening its connector. For namespace-scoped authz. */
  namespaceOf(volumeId: string): Promise<string | null>;
}

/** One namespace (org) a user belongs to. */
export interface NamespaceMembership {
  /** Organization/namespace id. */
  id: string;
  /** Display name of the org. */
  name: string;
  /** Org slug (a personal namespace is `personal-<userId>`; used to prefer team orgs as default). */
  slug: string;
  role: Role;
}

/** Resolves a user's role in a namespace (backed by the Better Auth `member` table). */
export interface MembershipResolver {
  roleFor(userId: string, namespaceId: string): Promise<Role | null>;
  /** Every namespace the user belongs to - drives active-org resolution + the workspace switcher. */
  listNamespaces(userId: string): Promise<NamespaceMembership[]>;
  /** The owner member's userId for a namespace - resource attribution for org-key callers (api.md). */
  namespaceOwner(namespaceId: string): Promise<string | null>;
  /** Count of org members (= billed seats baseline) for a namespace. */
  memberCount(namespaceId: string): Promise<number>;
}

/** A namespace's active paid subscription, if any (backed by the Better Auth `subscription` table). */
export interface ActiveSubscription {
  /** Purchased seats (defaults to 1 when the column is null). */
  seats: number;
}

/** Resolves the paid subscription that gates a namespace's entitlement (billing.md). */
export interface SubscriptionResolver {
  /** The active or trialing subscription for a namespace (org id), or null when on the free tier. */
  activeSubscription(namespaceId: string): Promise<ActiveSubscription | null>;
}

export interface ResourceMember {
  userId: string;
  email: string;
  name: string;
  role: ResourceRole;
}

/**
 * Resource-level access (rbac.md): a user's role on a specific connector/volume, plus the
 * membership management that powers sharing. The owner is a `full` member. Backed by the
 * `connector_member` / `volume_member` tables.
 */
export interface ResourceAccessRepository {
  volumeRoleFor(userId: string, volumeId: string): Promise<ResourceRole | null>;
  connectorRoleFor(userId: string, connectorId: string): Promise<ResourceRole | null>;
  listAccessibleVolumes(userId: string): Promise<VolumeRecord[]>;
  addVolumeMember(volumeId: string, userId: string, role: ResourceRole): Promise<void>;
  removeVolumeMember(volumeId: string, userId: string): Promise<void>;
  listVolumeMembers(volumeId: string): Promise<ResourceMember[]>;
  addConnectorMember(connectorId: string, userId: string, role: ResourceRole): Promise<void>;
  /** Resolve an invitee by email (case-insensitive). Null if no such user. */
  userByEmail(email: string): Promise<{ id: string; email: string; name: string } | null>;
}
