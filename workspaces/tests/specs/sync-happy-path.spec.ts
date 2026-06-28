import { createDriver } from "@byos3/s3";
import { expect, test } from "../fixtures";

/**
 * The core product loop, end to end through the real UI + a real S3-compatible bucket (MinIO):
 * register an account, connect your own bucket, upload a file, and confirm the bytes actually landed
 * in the bucket. Exercises the whole presigned, direct-to-bucket path - the worker only ever signs.
 */
test("register → connect a bucket → upload a file → it lands in the bucket", async ({
  makeUser,
  minio,
}) => {
  const user = await makeUser();
  await user.register();

  const prefix = `e2e-${Date.now().toString(36)}/`;
  await user.workspace.connectBucket({
    provider: "custom",
    endpoint: minio.endpoint,
    accessKeyId: minio.accessKeyId,
    secret: minio.secret,
    bucket: minio.bucket,
    region: "us-east-1",
    prefix,
  });

  const name = `notes-${Date.now().toString(36)}.txt`;
  await user.workspace.uploadFile(name, "hello from the byos3 e2e suite");
  await expect(user.workspace.file(name)).toBeVisible();

  // Independently confirm the upload reached the bucket under the volume's prefix (content-addressed
  // chunks). We talk to MinIO directly with the same driver the worker presigns with.
  const driver = createDriver(
    {
      provider: "custom",
      endpoint: minio.endpoint,
      region: "us-east-1",
      accessKeyId: minio.accessKeyId,
      secret: minio.secret,
      bucket: minio.bucket,
    },
    { allowPrivate: true },
  );
  const listed = await driver.listObjects(prefix);
  expect(
    listed.items.length,
    "expected at least one object under the volume prefix",
  ).toBeGreaterThan(0);
});
