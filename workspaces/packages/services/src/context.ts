import type {
  ConnectorRepository,
  DriverFactory,
  MembershipResolver,
  ResourceAccessRepository,
  SubscriptionResolver,
  Vault,
  VolumeRepository,
} from "@byos3/core";
import type { PlatformRole } from "@byos3/core/authz";

/** Who is making the call - resolved by the transport (session cookie OR API key). */
export interface Principal {
  /**
   * The acting user. For sessions this is the signed-in user. For org-owned API keys there is no
   * acting user, so the transport sets this to the namespace's owner (resource attribution only -
   * authorization for key callers goes through `keyNamespaceId`, never this).
   */
  userId: string;
  platformRole?: PlatformRole;
  /** Present for API-key requests - the action must also be within these scopes. */
  keyScopes?: Record<string, string[]>;
  /**
   * Present ONLY for org-owned API-key requests: the namespace the key belongs to. When set,
   * authorization is NAMESPACE-scoped - the key may act on this namespace and every volume in it
   * (intersected with `keyScopes`), independent of any user's role. See @byos3/services authz, api.md.
   */
  keyNamespaceId?: string;
  /**
   * Volume scope for an org-owned key's FILE operations: `"*"` (or absent) means every volume in the
   * namespace; an array restricts file ops to those volume ids. Namespace membership is still
   * required on top of this. See api.md.
   */
  keyVolumeScope?: "*" | string[];
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
  /** The namespace's paid subscription, for entitlement gates (billing.md). */
  subscriptions: SubscriptionResolver;
  /**
   * Whether billing is configured on this deploy (a Stripe key is set). When false, billing is OFF -
   * there are no subscriptions and every gate is lifted (self-hosting without Stripe = everything
   * unlocked). Resolved by each transport's composition root from the env. See billing.md.
   */
  billingEnabled: boolean;
  vault: Vault;
  driverFactory: DriverFactory;
}
