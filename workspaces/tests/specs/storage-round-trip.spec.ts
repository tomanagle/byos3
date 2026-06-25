import { createDriver } from "@byos3/s3";
import { expect, test } from "@playwright/test";
import { MINIO } from "../minio";

/**
 * e2e of the storage path against a REAL S3-compatible server (the MinIO fake bucket), mounted via
 * the `custom` provider. This is the exact production contract: the server only ever PRESIGNS, and
 * the bytes travel over the presigned URL directly between the client and the bucket - never through
 * the worker. We presign with `@byos3/s3` and move bytes with Playwright's `request` fixture (a
 * stand-in for the browser's fetch).
 */
function driver() {
  return createDriver({
    provider: "custom",
    endpoint: MINIO.endpoint,
    region: "us-east-1",
    accessKeyId: MINIO.accessKeyId,
    secret: MINIO.secret,
    bucket: MINIO.bucket,
  });
}

test("custom provider: presigned PUT → HEAD → GET → list → DELETE round-trip", async ({
  request,
}) => {
  const d = driver();

  // probe = ListObjectsV2(maxKeys=1): connectivity + credentials accepted.
  const probe = await d.probe();
  expect(probe.ok, probe.reason).toBe(true);

  const key = `e2e/hello-${Date.now()}.txt`;
  const body = `byos3 e2e ${key}`;
  const expectedSize = Buffer.byteLength(body);

  // Upload straight to the bucket over a presigned PUT.
  const put = await d.presignPut(key);
  expect(put.method).toBe("PUT");
  const putRes = await request.fetch(put.url, { method: "PUT", data: body });
  expect(putRes.ok(), `PUT ${putRes.status()}`).toBe(true);

  // Server-side metadata reflects the upload.
  const head = await d.headObject(key);
  expect(head?.size).toBe(expectedSize);

  // Download straight from the bucket over a presigned GET; bytes survive intact.
  const get = await d.presignGet(key);
  const getRes = await request.get(get.url);
  expect(getRes.ok(), `GET ${getRes.status()}`).toBe(true);
  expect(await getRes.text()).toBe(body);

  // Visible in a prefix listing, then gone after delete.
  const listed = await d.listObjects("e2e/");
  expect(listed.items.some((i) => i.key === key)).toBe(true);

  await d.deleteObject(key);
  expect(await d.headObject(key)).toBeNull();
});
