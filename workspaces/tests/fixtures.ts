import { test as base, expect } from "@playwright/test";
import { MINIO } from "./minio";
import { type Creds, User, uniqueCreds } from "./helpers/users";

interface Fixtures {
  /** The MinIO fake-bucket connection (endpoint/creds/bucket) the app connects to. */
  minio: typeof MINIO;
  /** Create a fresh user in an isolated browser context; disposed at end of test. */
  makeUser: (over?: Partial<Creds>) => Promise<User>;
}

/**
 * The app e2e test object. Extends Playwright's base `test` with the MinIO fixture + a `makeUser`
 * factory so a spec can compose flows from real accounts, e.g.
 *   const owner = await makeUser();  await owner.register();
 *   await owner.workspace.connectBucket({ ...minio });
 * Multi-user flows just call `makeUser()` again - each gets its own context.
 */
export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must take the fixtures object.
  minio: async ({}, use) => {
    await use(MINIO);
  },
  makeUser: async ({ browser, baseURL }, use) => {
    const created: User[] = [];
    await use(async (over) => {
      const user = await User.create(
        browser,
        baseURL ?? "http://localhost:3000",
        uniqueCreds(over),
      );
      created.push(user);
      return user;
    });
    await Promise.all(created.map((user) => user.dispose()));
  },
});

export { expect };
