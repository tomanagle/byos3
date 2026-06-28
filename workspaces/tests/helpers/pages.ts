import { type Locator, type Page, expect } from "@playwright/test";

/** S3 connection a test mounts via the Connect dialog (defaults suit the MinIO fake bucket). */
export interface BucketSpec {
  provider?: string;
  endpoint: string;
  accessKeyId: string;
  secret: string;
  bucket: string;
  region?: string;
  prefix?: string;
}

/** The files workspace: connect a bucket, upload, and read the file list. */
export class Workspace {
  constructor(readonly page: Page) {}

  /** Open the Connect dialog, fill the form, mount, and open the new volume. */
  async connectBucket(spec: BucketSpec): Promise<void> {
    await this.page
      .getByRole("button", { name: /connect a bucket/i })
      .first()
      .click();
    const dialog = this.page.getByRole("dialog");
    await dialog.getByTestId(`provider-${spec.provider ?? "custom"}`).click();
    await dialog.getByLabel("Access key ID").fill(spec.accessKeyId);
    await dialog.getByLabel("Secret access key").fill(spec.secret);
    await dialog.getByLabel("Region").fill(spec.region ?? "us-east-1");
    await dialog.getByLabel("Bucket").fill(spec.bucket);
    // "Endpoint" for named providers, "S3 endpoint URL" for custom - both match /endpoint/i.
    await dialog.getByLabel(/endpoint/i).fill(spec.endpoint);
    if (spec.prefix) await dialog.getByLabel("Prefix").fill(spec.prefix);

    await dialog.getByRole("button", { name: /test & mount/i }).click();
    // The read-only probe + mount can take a moment against a fresh bucket.
    const openVolume = dialog.getByRole("button", { name: /open volume/i });
    await expect(openVolume).toBeVisible({ timeout: 30_000 });
    await openVolume.click();
  }

  /** Upload a text file straight through the hidden file input (the real chunk → presign → PUT path). */
  async uploadFile(name: string, content: string): Promise<void> {
    await this.page.getByTestId("upload-input").setInputFiles({
      name,
      mimeType: "text/plain",
      buffer: Buffer.from(content),
    });
    await expect(this.file(name)).toBeVisible({ timeout: 30_000 });
  }

  /** A file/row in the canvas by name (works across list/grid views). */
  file(name: string): Locator {
    return this.page.getByText(name, { exact: false });
  }
}

/** The Team screen: invite teammates, read pending invites, inspect members. */
export class TeamPage {
  constructor(readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto("/team");
    await expect(this.page.getByRole("heading", { name: /^team$/i })).toBeVisible();
  }

  async invite(email: string, role: "reader" | "writer" | "admin" = "writer"): Promise<void> {
    await this.page.getByPlaceholder("teammate@example.com").fill(email);
    await this.page.getByRole("combobox").selectOption(role);
    await this.page.getByRole("button", { name: /^invite$/i }).click();
    await expect(this.pendingInvite(email)).toBeVisible({ timeout: 15_000 });
  }

  pendingInvite(email: string): Locator {
    return this.page.getByRole("listitem").filter({ hasText: email });
  }

  member(email: string): Locator {
    return this.page.getByRole("listitem").filter({ hasText: email });
  }

  /** Click "Copy link" on a pending invite and return the accept URL from the clipboard. */
  async inviteLink(email: string): Promise<string> {
    await this.pendingInvite(email)
      .getByRole("button", { name: /copy link/i })
      .click();
    return this.page.evaluate(() => navigator.clipboard.readText());
  }
}

/** The standalone /accept-invitation page (driven on the INVITEE's context). */
export class AcceptInvitePage {
  constructor(readonly page: Page) {}

  /** Open an accept link (must be signed in already) and join the org. */
  async accept(link: string): Promise<void> {
    // The link is absolute (origin + /accept-invitation?id=...); navigate to its path + query.
    await this.page.goto(new URL(link).pathname + new URL(link).search);
    await this.page.getByRole("button", { name: /accept invitation/i }).click();
    // On success it redirects to the workspace.
    await expect(this.page.getByRole("button", { name: /all files/i })).toBeVisible({
      timeout: 30_000,
    });
  }
}

/** The rail's workspace (org) switcher. */
export class OrgSwitcher {
  constructor(readonly page: Page) {}

  /** The switcher trigger shows the active workspace name + a "Workspace" sublabel. */
  get trigger(): Locator {
    return this.page.getByRole("button").filter({ hasText: "Workspace" });
  }

  async switchTo(name: string): Promise<void> {
    await this.trigger.click();
    await this.page.getByRole("button", { name }).click();
    await this.page.getByRole("button", { name: /all files/i }).waitFor();
  }
}
