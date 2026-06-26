import { expect, test } from "bun:test";
import {
  CURRENCY,
  FREE_LIMITS,
  PAID_LIMITS,
  PRICE_CENTS,
  isUnlimited,
  withinLimit,
} from "./billing";

test("prices are USD; annual = 10x monthly (2 months free)", () => {
  expect(CURRENCY).toBe("usd");
  expect(PRICE_CENTS.monthly).toBe(300);
  expect(PRICE_CENTS.annual).toBe(PRICE_CENTS.monthly * 10);
});

test("free is tight, paid is unlimited where it counts", () => {
  expect(FREE_LIMITS.volumes).toBe(1);
  expect(FREE_LIMITS.devices).toBe(1);
  expect(isUnlimited(PAID_LIMITS.volumes)).toBe(true);
  expect(isUnlimited(FREE_LIMITS.volumes)).toBe(false);
  expect(PAID_LIMITS.opsPerMonth).toBeGreaterThan(FREE_LIMITS.opsPerMonth);
});

test("withinLimit treats -1 as unlimited and is exclusive at the cap", () => {
  expect(withinLimit(0, 1)).toBe(true);
  expect(withinLimit(1, 1)).toBe(false);
  expect(withinLimit(999_999, -1)).toBe(true);
});
