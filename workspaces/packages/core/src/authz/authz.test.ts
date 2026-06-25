import { test, expect } from "bun:test";
import { roleCan } from "./policy";
import { authorize } from "./authorize";

test("roleCan reflects the permission matrix", () => {
  expect(roleCan("owner", "file", "delete")).toBe(true);
  expect(roleCan("owner", "billing", "manage")).toBe(true);
  expect(roleCan("admin", "billing", "manage")).toBe(false); // owner-only
  expect(roleCan("writer", "file", "create")).toBe(true);
  expect(roleCan("writer", "member", "create")).toBe(false);
  expect(roleCan("reader", "file", "read")).toBe(true);
  expect(roleCan("reader", "file", "create")).toBe(false);
});

const principal = { userId: "u1" };

test("namespace role grants/denies", () => {
  expect(
    authorize({ principal, membership: { role: "writer" }, action: "file:create" }).allow,
  ).toBe(true);
  expect(
    authorize({ principal, membership: { role: "reader" }, action: "file:create" }).allow,
  ).toBe(false);
  expect(authorize({ principal, membership: null, action: "file:read" }).allow).toBe(false);
});

test("subtree grant allows within the subtree", () => {
  const node = { gid: "node_child", path: "node_root/node_child" };
  const d = authorize({
    principal,
    grants: [{ subtreeNodeGid: "node_root", role: "writer" }],
    action: "file:create",
    node,
  });
  expect(d.allow).toBe(true);
  expect(d.reason).toBe("grant");
});

test("public link is read-only", () => {
  const node = { gid: "n", path: "share_root/n" };
  expect(
    authorize({ principal, link: { subtreeNodeGid: "share_root" }, action: "file:read", node })
      .allow,
  ).toBe(true);
  expect(
    authorize({ principal, link: { subtreeNodeGid: "share_root" }, action: "file:create", node })
      .allow,
  ).toBe(false);
});

test("platform scope acts on platform resources but not tenant content", () => {
  const admin = { userId: "staff", platformRole: "admin" as const };
  expect(authorize({ principal: admin, action: "user:ban" }).allow).toBe(true);
  // platform role must NOT grant ambient access to a tenant file
  expect(authorize({ principal: admin, membership: null, action: "file:read" }).allow).toBe(false);
});
