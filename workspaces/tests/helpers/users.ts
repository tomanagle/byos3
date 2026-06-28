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
 * stay independent). `register()` / `login()` drive the real auth UI; the `Workspace` / page objects
 * hang off `.page`. Created via the `makeUser` fixture, which disposes them at the end of the test.
 */
export class User {
  readonly workspace: Workspace;

  private constructor(
    readonly creds: Creds,
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
    return new User(creds, context, page);
  }

  /** Register through the sign-up form and land in the workspace. */
  async register(): Promise<this> {
    await this.page.goto("/sign-up");
    await this.page.getByLabel("Name").fill(this.creds.name);
    await this.page.getByLabel("Email").fill(this.creds.email);
    await this.page.getByLabel("Password").fill(this.creds.password);
    await this.page.getByRole("button", { name: /create account/i }).click();
    await this.expectWorkspace();
    return this;
  }

  /** Sign in through the form (the account must already exist). */
  async login(): Promise<this> {
    await this.page.goto("/sign-in");
    await this.page.getByLabel("Email").fill(this.creds.email);
    await this.page.getByLabel("Password").fill(this.creds.password);
    await this.page.getByRole("button", { name: /^sign in$/i }).click();
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
