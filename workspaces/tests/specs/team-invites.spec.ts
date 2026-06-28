import { expect, test } from "../fixtures";
import { AcceptInvitePage, TeamPage } from "../helpers/pages";

/**
 * The team flow: an owner invites a teammate by email, the teammate registers and accepts the invite
 * (via the copyable accept link - we ship no email provider), and the owner then sees them as a
 * member. Runs against the billing-OFF e2e stack, where seats are unlimited (self-host), so the
 * invite isn't gated. Seat-gating itself is covered by unit tests in @byos3/services / @byos3/auth.
 */
test("owner invites a teammate, who registers, accepts, and becomes a member", async ({
  makeUser,
}) => {
  const owner = await makeUser();
  await owner.register();

  // makeUser() only builds creds + a context; the teammate registers after being invited.
  const teammate = await makeUser();

  const ownerTeam = new TeamPage(owner.page);
  await ownerTeam.goto();
  await ownerTeam.invite(teammate.creds.email, "writer");

  const link = await ownerTeam.inviteLink(teammate.creds.email);
  expect(link).toContain("/accept-invitation?id=");

  await teammate.register();
  await new AcceptInvitePage(teammate.page).accept(link);

  // Back on the owner's Team screen, the teammate is now a member (pending invite resolved).
  await owner.page.reload();
  await expect(ownerTeam.member(teammate.creds.email)).toBeVisible({ timeout: 15_000 });
});
