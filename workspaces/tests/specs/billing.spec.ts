import { expect, test } from "../fixtures";

/**
 * Billing. The default e2e stack runs WITHOUT a Stripe key, so billing is disabled and every feature
 * is unlocked (the self-hosting path) - we assert that state here, in CI. The actual upgrade flow
 * needs Stripe + the hosted Checkout page, which isn't CI-friendly, so it's gated behind E2E_STRIPE
 * (run locally with the `stripe` dev sidecar + a sandbox key in the web .dev.vars). See billing.md.
 */
test("self-host: billing is disabled and the screen says so", async ({ makeUser }) => {
  const user = await makeUser();
  await user.register();
  await user.page.goto("/billing");
  await expect(user.page.getByText(/billing isn't enabled/i)).toBeVisible();
});

test.describe("upgrade flow (requires Stripe)", () => {
  test.skip(
    !process.env.E2E_STRIPE,
    "set E2E_STRIPE=1 and run with the Stripe sidecar + a sandbox key to exercise Checkout",
  );

  test("choosing seats and upgrading redirects to Stripe Checkout", async ({ makeUser }) => {
    const user = await makeUser();
    await user.register();
    await user.page.goto("/billing");

    // Add a seat, then upgrade - which hands off to Stripe's hosted Checkout.
    await user.page.getByRole("button", { name: /add seat/i }).click();
    await user.page.getByRole("button", { name: /^upgrade/i }).click();
    await user.page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    expect(user.page.url()).toContain("checkout.stripe.com");
  });
});
