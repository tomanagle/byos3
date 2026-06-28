import {
  AppError,
  Connector,
  type MembershipResolver,
  type ResourceAccessRepository,
  type SubscriptionResolver,
  Volume,
} from "@byos3/core";
import { type ConnectorRecord, type VolumeRecord, isUnlimited } from "@byos3/protocol";
import { createDriver } from "@byos3/s3";
import { expect, test } from "bun:test";
import { connectBucket } from "./connectors";
import type { Principal, ServiceContext } from "./context";
import { resolveEntitlement } from "./entitlement";
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
// `opts` lets entitlement tests vary the existing volume count + active subscription.
function ctxFor(
  principal: Principal,
  role: string | null,
  opts: {
    volumesInNamespace?: VolumeRecord[];
    activeSub?: { seats: number } | null;
    billingEnabled?: boolean;
  } = {},
): ServiceContext {
  const connector = new Connector(connRecord, { vault, driverFactory: createDriver });
  const volume = new Volume(volRecord, { connector });
  const memberships: MembershipResolver = {
    roleFor: async () => null,
    listNamespaces: async () => [
      { id: "ns_1", name: "Personal", slug: "personal-u1", role: "owner" },
    ],
    namespaceOwner: async () => "u1",
    memberCount: async () => 1,
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
  const subscriptions: SubscriptionResolver = {
    activeSubscription: async () => opts.activeSub ?? null,
  };
  return {
    principal,
    connectors: { get: async () => connector, insert: async () => {} },
    volumes: {
      get: async () => volume,
      insert: async () => {},
      listByNamespace: async () => opts.volumesInNamespace ?? [],
      namespaceOf: async () => volRecord.namespaceId,
    },
    memberships,
    access,
    subscriptions,
    billingEnabled: opts.billingEnabled ?? true,
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

const connectInput = {
  provider: "r2" as const,
  endpoint: "https://acct.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "b",
  prefix: "p/",
  accessKeyId: "AKIA",
  secret: "shh",
  label: "vol",
};

test("free tier (no sub) is capped at 1 volume - the 2nd connect is denied", async () => {
  // One volume already exists in the namespace; free limit is 1 -> limit_exceeded before any probe.
  const ctx = ctxFor({ userId: "u1", activeNamespaceId: "ns_1" }, "full", {
    volumesInNamespace: [volRecord],
    activeSub: null,
  });
  await expect(connectBucket(ctx, connectInput)).rejects.toMatchObject({ code: "limit_exceeded" });
});

test("billing disabled (self-host): every limit is unlimited, no gate fires", async () => {
  // No Stripe key => no subscriptions => everything unlocked, even with an existing volume.
  const ctx = ctxFor({ userId: "u1" }, "full", {
    volumesInNamespace: [volRecord],
    activeSub: null,
    billingEnabled: false,
  });
  const ent = await resolveEntitlement(ctx, "ns_1");
  expect(ent.paid).toBe(true);
  expect(isUnlimited(ent.limits.volumes)).toBe(true);
  expect(isUnlimited(ent.limits.opsPerMonth)).toBe(true);
});

test("entitlement: an active sub yields paid limits + seats; none yields free", async () => {
  const paid = await resolveEntitlement(
    ctxFor({ userId: "u1" }, "full", { activeSub: { seats: 3 } }),
    "ns_1",
  );
  expect(paid.paid).toBe(true);
  expect(paid.seats).toBe(3);
  expect(isUnlimited(paid.limits.volumes)).toBe(true);

  const free = await resolveEntitlement(ctxFor({ userId: "u1" }, "full"), "ns_1");
  expect(free.paid).toBe(false);
  expect(free.limits.volumes).toBe(1);
});
