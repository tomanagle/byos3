import { expect, test } from "bun:test";
import { corsConfigXml, corsPolicyJson } from "./cors";

const ORIGIN = "http://localhost:4500";

test("corsPolicyJson includes the fields a presigned PUT preflight needs", () => {
  const policy = JSON.parse(corsPolicyJson([ORIGIN])) as Array<Record<string, unknown>>;
  expect(policy).toHaveLength(1);
  const rule = policy[0]!;
  expect(rule.AllowedOrigins).toEqual([ORIGIN]);
  expect(rule.AllowedMethods).toEqual(["GET", "PUT", "HEAD"]);
  // AllowedHeaders is the bit users miss - without it the PUT preflight fails.
  expect(rule.AllowedHeaders).toEqual(["*"]);
  expect(rule.ExposeHeaders).toEqual(["ETag"]);
  expect(rule.MaxAgeSeconds).toBe(3600);
});

test("corsConfigXml renders one rule with all origins + methods + headers", () => {
  const xml = corsConfigXml([ORIGIN, "https://app.byos3.com"]);
  expect(xml).toContain("<CORSConfiguration");
  expect(xml).toContain(`<AllowedOrigin>${ORIGIN}</AllowedOrigin>`);
  expect(xml).toContain("<AllowedOrigin>https://app.byos3.com</AllowedOrigin>");
  expect(xml).toContain("<AllowedMethod>PUT</AllowedMethod>");
  expect(xml).toContain("<AllowedHeader>*</AllowedHeader>");
  expect(xml).toContain("<ExposeHeader>ETag</ExposeHeader>");
  expect(xml).toContain("<MaxAgeSeconds>3600</MaxAgeSeconds>");
});

test("corsConfigXml escapes XML-special characters in origins", () => {
  const xml = corsConfigXml(["https://x.test/?a=1&b=2"]);
  expect(xml).toContain("&amp;");
  expect(xml).not.toContain("a=1&b=2");
});
