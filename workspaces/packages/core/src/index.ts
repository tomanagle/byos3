export { Connector, type ConnectorDeps } from "./connector";
export { Volume, type VolumeDeps } from "./volume";
export { AppError, type AppErrorCode } from "./errors";
export { ROOT_GID, applyOp, emptyTree, type Effect, type TreeNode, type TreeState } from "./tree";
export type {
  Vault,
  DriverFactory,
  ConnectorRepository,
  VolumeRepository,
  MembershipResolver,
  ResourceAccessRepository,
  ResourceMember,
} from "./ports";
