import { MINIO, startMinio } from "./minio";

/** Bring up the MinIO fake bucket before the e2e suite and expose its endpoint to the specs. */
export default async function globalSetup(): Promise<void> {
  await startMinio();
  process.env.S3_E2E_ENDPOINT = MINIO.endpoint;
  // eslint-disable-next-line no-console
  console.log(`\n▸ e2e: MinIO ready at ${MINIO.endpoint} (bucket ${MINIO.bucket})\n`);
}
