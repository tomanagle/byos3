import { describe, expect, test } from "bun:test";
import { isResourceRole, resourceCan } from "./resource";

describe("resourceCan - resource-level sharing roles", () => {
  test("read_only: read/list yes; write/manage no", () => {
    expect(resourceCan("read_only", "file", "read")).toBe(true);
    expect(resourceCan("read_only", "volume", "list")).toBe(true);
    expect(resourceCan("read_only", "file", "create")).toBe(false);
    expect(resourceCan("read_only", "file", "delete")).toBe(false);
    expect(resourceCan("read_only", "volume", "delete")).toBe(false);
    expect(resourceCan("read_only", "share", "create")).toBe(false);
  });

  test("read_write: full file CRUD + create shares; cannot manage/delete the resource", () => {
    expect(resourceCan("read_write", "file", "create")).toBe(true);
    expect(resourceCan("read_write", "file", "delete")).toBe(true);
    expect(resourceCan("read_write", "share", "create")).toBe(true);
    expect(resourceCan("read_write", "volume", "delete")).toBe(false);
    expect(resourceCan("read_write", "share", "revoke")).toBe(false);
    expect(resourceCan("read_write", "volume", "update")).toBe(false);
  });

  test("full: everything incl. delete the resource + manage shares", () => {
    expect(resourceCan("full", "file", "create")).toBe(true);
    expect(resourceCan("full", "volume", "delete")).toBe(true);
    expect(resourceCan("full", "volume", "update")).toBe(true);
    expect(resourceCan("full", "share", "revoke")).toBe(true);
    expect(resourceCan("full", "share", "list")).toBe(true);
  });

  test("isResourceRole guards unknown values", () => {
    expect(isResourceRole("full")).toBe(true);
    expect(isResourceRole("owner")).toBe(false);
    expect(isResourceRole(null)).toBe(false);
  });
});
