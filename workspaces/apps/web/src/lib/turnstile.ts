/**
 * Verify a Cloudflare Turnstile token server-side. Pure function (no binding imports) so it's
 * safe to import anywhere. Pass the secret from `env.TURNSTILE_SECRET_KEY`.
 * If no secret is configured (e.g. a bare local env), verification is skipped (returns true).
 */
export async function verifyTurnstile(
  secret: string | undefined,
  token: string,
  ip: string | null,
): Promise<boolean> {
  if (!secret) return true;
  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}
