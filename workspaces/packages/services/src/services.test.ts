import {
  AppError,
  Connector,
  type MembershipResolver,
  type ResourceAccessRepository,
  Volume,
} from "@byos3/core";
import type { ConnectorRecord, VolumeRecord } from "@byos3/protocol";
import { createDriver } from "@byos3/s3";
import { expect, test } from "bun:test";
import type { Principal, ServiceContext } from "./context";
import { uploadIntent } from "./volumes";

const vault = {
  seal: async (p: string) => `sealed:${p}`,
  open: async (c: string) => c.replace(/^sealed:/, ""),
};

const volRecord: VolumeRecord = {
  id: "vol_1",
  connectorId: "conn_1",
  namespaceId: "ns_1",
  bucket: "my-bucket",
  prefix: "byos3/",
  label: "R2",
  status: "active",
  createdAt: 0,
};
const connRecord: ConnectorRecord = {
  id: "conn_1",
  ownerUserId: "u1",
  provider: "r2",
  endpoint: "https://acct.r2.cloudflarestorage.com",
  region: "auto",
  accessKeyId: "AKIA",
  secretCipher: "sealed:topsecret",
  label: "r2",
  status: "active",
  createdAt: 0,
};

// `role` here is the caller's RESOURCE role on the volume (full | read_write | read_only | null).
function ctxFor(principal: Principal, role: string | null): ServiceContext {
  const connector = new Connector(connRecord, { vault, driverFactory: createDriver });
  const volume = new Volume(volRecord, { connector });
  const memberships: MembershipResolver = {
    roleFor: async () => null,
    primaryNamespaceId: async () => "ns_1",
    namespaceOwner: async () => "u1",
  };
  const access: ResourceAccessRepository = {
    volumeRoleFor: async () => role as never,
    connectorRoleFor: async () => role as never,
    listAccessibleVolumes: async () => [],
    addVolumeMember: async () => {},
    removeVolumeMember: async () => {},
    listVolumeMembers: async () => [],
    addConnectorMember: async () => {},
    userByEmail: async () => null,
  };
  return {
    principal,
    connectors: { get: async () => connector, insert: async () => {} },
    volumes: {
      get: async () => volume,
      insert: async () => {},
      listByNamespace: async () => [],
      namespaceOf: async () => volRecord.namespaceId,
    },
    memberships,
    access,
    vault,
    driverFactory: createDriver,
  };
}

test("read_write can get an upload presign; the secret never leaks", async () => {
  const req = await uploadIntent(ctxFor({ userId: "u1" }, "read_write"), {
    volumeId: "vol_1",
    hash: "a".repeat(64),
  });
  expect(req.method).toBe("PUT");
  expect(new URL(req.url).pathname).toBe(`/my-bucket/byos3/chunks/${"a".repeat(64)}`);
  expect(req.url).not.toContain("topsecret");
});

test("read_only is denied file:create", async () => {
  await expect(
    uploadIntent(ctxFor({ userId: "u1" }, "read_only"), {
      volumeId: "vol_1",
      hash: "a".repeat(64),
    }),
  ).rejects.toBeInstanceOf(AppError);
});

test("a non-member is denied", async () => {
  await expect(
    uploadIntent(ctxFor({ userId: "u9" }, null), { volumeId: "vol_1", hash: "a".repeat(64) }),
  ).rejects.toBeInstanceOf(AppError);
});

test("an API key without file:create scope is denied even with read_write", async () => {
  const principal: Principal = { userId: "u1", keyScopes: { file: ["read"] } };
  await expect(
    uploadIntent(ctxFor(principal, "read_write"), { volumeId: "vol_1", hash: "a".repeat(64) }),
  ).rejects.toBeInstanceOf(AppError);
});

test("an org-owned key authorizes by namespace, not a volume role", async () => {
  // keyNamespaceId matches the volume's namespace + the scope permits it -> allowed even though the
  // (per-user) volume role is null. This is the org-credential path.
  const principal: Principal = {
    userId: "owner",
    keyNamespaceId: "ns_1",
    keyScopes: { file: ["create", "read"] },
  };
  const req = await uploadIntent(ctxFor(principal, null), {
    volumeId: "vol_1",
    hash: "a".repeat(64),
  });
  expect(req.method).toBe("PUT");
});

test("an org-owned key from a DIFFERENT namespace is denied", async () => {
  const principal: Principal = {
    userId: "owner",
    keyNamespaceId: "ns_other",
    keyScopes: { file: ["create"] },
  };
  await expect(
    uploadIntent(ctxFor(principal, "full"), { volumeId: "vol_1", hash: "a".repeat(64) }),
  ).rejects.toBeInstanceOf(AppError);
});

test("a key volume-scoped to the target volume is allowed", async () => {
  const principal: Principal = {
    userId: "owner",
    keyNamespaceId: "ns_1",
    keyScopes: { file: ["create"] },
    keyVolumeScope: ["vol_1"],
  };
  const req = await uploadIntent(ctxFor(principal, null), {
    volumeId: "vol_1",
    hash: "a".repeat(64),
  });
  expect(req.method).toBe("PUT");
});

test("a key volume-scoped to OTHER volumes is denied even in the right namespace", async () => {
  const principal: Principal = {
    userId: "owner",
    keyNamespaceId: "ns_1",
    keyScopes: { file: ["create"] },
    keyVolumeScope: ["vol_other"],
  };
  await expect(
    uploadIntent(ctxFor(principal, null), { volumeId: "vol_1", hash: "a".repeat(64) }),
  ).rejects.toBeInstanceOf(AppError);
});
