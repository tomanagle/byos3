import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";
import { Workspace } from "./pages";

export interface Creds {
  name: string;
  email: string;
  password: string;
}

let seq = 0;

/** A unique, deterministic-ish account so parallel tests never collide. */
export function uniqueCreds(over: Partial<Creds> = {}): Creds {
  seq += 1;
  const tag = `${Date.now().toString(36)}-${seq}`;
  return {
    name: over.name ?? `E2E ${tag}`,
    email: over.email ?? `e2e-${tag}@byos3.test`,
    password: over.password ?? "correct-horse-battery-staple",
  };
}

/**
 * A test user with its OWN isolated browser context (so multi-user flows - invite/accept, switching -
 * stay independent). `register()` / `login()` hit the Better Auth API through the context's request
 * (Playwright's recommended auth-setup path: fast + reliable, and the session cookie is shared with
 * the context's pages), then land in the workspace. The product UI (connect, upload, invite, accept)
 * is what the specs actually exercise via the `Workspace` / page objects on `.page`. Created via the
 * `makeUser` fixture, which disposes them at the end of the test.
 */
export class User {
  readonly workspace: Workspace;

  private constructor(
    readonly creds: Creds,
    readonly baseURL: string,
    readonly context: BrowserContext,
    readonly page: Page,
  ) {
    this.workspace = new Workspace(page);
  }

  static async create(browser: Browser, baseURL: string, creds: Creds): Promise<User> {
    const context = await browser.newContext({
      baseURL,
      // The team flow surfaces the accept link via "Copy link"; let the test read it back.
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    return new User(creds, baseURL, context, page);
  }

  /** Create the account via the Better Auth API (auto-signs-in), then open the workspace. */
  async register(): Promise<this> {
    const res = await this.context.request.post("/api/auth/sign-up/email", {
      // Better Auth checks Origin against trustedOrigins (which includes localhost:3000).
      headers: { origin: this.baseURL },
      data: { name: this.creds.name, email: this.creds.email, password: this.creds.password },
    });
    if (!res.ok()) throw new Error(`sign-up failed: ${res.status()} ${await res.text()}`);
    await this.page.goto("/");
    await this.expectWorkspace();
    return this;
  }

  /** Sign in via the Better Auth API (the account must already exist), then open the workspace. */
  async login(): Promise<this> {
    const res = await this.context.request.post("/api/auth/sign-in/email", {
      headers: { origin: this.baseURL },
      data: { email: this.creds.email, password: this.creds.password },
    });
    if (!res.ok()) throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
    await this.page.goto("/");
    await this.expectWorkspace();
    return this;
  }

  /** Resolve when the authenticated workspace chrome is visible (the rail's nav is always present). */
  async expectWorkspace(): Promise<void> {
    await expect(this.page.getByRole("button", { name: /all files/i })).toBeVisible({
      timeout: 30_000,
    });
  }

  async dispose(): Promise<void> {
    await this.context.close();
  }
}
