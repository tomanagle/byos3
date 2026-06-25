import type {
  ConnectorRepository,
  DriverFactory,
  MembershipResolver,
  ResourceAccessRepository,
  Vault,
  VolumeRepository,
} from "@byos3/core";
import type { PlatformRole } from "@byos3/core/authz";

/** Who is making the call - resolved by the transport (session cookie OR API key). */
export interface Principal {
  userId: string;
  platformRole?: PlatformRole;
  /** Present for API-key requests - the action must also be within these scopes. */
  keyScopes?: Record<string, string[]>;
}

/**
 * Everything a service needs: the authenticated principal + injected infrastructure. Built by each
 * transport's composition root. Services do AUTHORIZATION + logic; transports do AUTHENTICATION.
 * See agents/docs/api.md and code-architecture.md.
 */
export interface ServiceContext {
  principal: Principal;
  connectors: ConnectorRepository;
  volumes: VolumeRepository;
  memberships: MembershipResolver;
  /** Resource-level access (per-connector/volume roles + sharing). See rbac.md. */
  access: ResourceAccessRepository;
  vault: Vault;
  driverFactory: DriverFactory;
}
