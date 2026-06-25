import { stopMinio } from "./minio";

/** Tear the MinIO fake bucket down after the e2e suite. Set `E2E_KEEP=1` to leave it running. */
export default function globalTeardown(): void {
  if (process.env.E2E_KEEP) {
    // eslint-disable-next-line no-console
    console.log(
      "\n▸ e2e: E2E_KEEP set - leaving MinIO running (down it with `bun run e2e:down`).\n",
    );
    return;
  }
  stopMinio();
}
