import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { createServiceLogger, createSpan } from "./index";

// Capture console.log so we can assert on the single emitted JSON line per request.
let lines: string[] = [];
const original = console.log;
beforeEach(() => {
  lines = [];
  console.log = mock((s: string) => lines.push(s));
});
afterEach(() => {
  console.log = original;
});

function emitted(): Record<string, unknown> {
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]!) as Record<string, unknown>;
}

test("root span emits exactly one JSON line with service + duration", () => {
  const span = createServiceLogger({ service: "test" }).createSpan({ "user.id": "u1" });
  span.set({ outcome: "success" });
  span.end();
  const e = emitted();
  expect(e["service"]).toBe("test");
  expect(e["user.id"]).toBe("u1");
  expect(e["outcome"]).toBe("success");
  expect(typeof e["duration_ms"]).toBe("number");
});

test("end() is idempotent - never double-emits", () => {
  const span = createSpan({}, { service: "test" });
  span.end();
  span.end();
  expect(lines).toHaveLength(1);
});

test("child spans fold into the same event under a dotted prefix and don't emit", () => {
  const span = createSpan({}, { service: "test" });
  const child = span.span("presign", { provider: "r2" });
  child.set({ expiry_s: 900 });
  child.end(); // stamps presign.duration_ms - no line yet
  expect(lines).toHaveLength(0);
  span.set({ "volume.id": "vol_1" });
  span.end();
  const e = emitted();
  expect(e["presign.provider"]).toBe("r2");
  expect(e["presign.expiry_s"]).toBe(900);
  expect(typeof e["presign.duration_ms"]).toBe("number");
  expect(e["volume.id"]).toBe("vol_1");
});

test("nested child spans chain their prefixes", () => {
  const span = createSpan({}, { service: "test" });
  const upload = span.span("upload");
  const hash = upload.span("hash");
  hash.set({ algo: "sha256" });
  hash.end();
  upload.end();
  span.end();
  const e = emitted();
  expect(e["upload.hash.algo"]).toBe("sha256");
  expect(typeof e["upload.hash.duration_ms"]).toBe("number");
  expect(typeof e["upload.duration_ms"]).toBe("number");
});

test("setError attaches message + type without throwing on non-Errors", () => {
  const span = createSpan({}, { service: "test" });
  span.setError(new TypeError("boom"));
  span.end();
  const e = emitted();
  expect(e["error.message"]).toBe("boom");
  expect(e["error.type"]).toBe("TypeError");
});
