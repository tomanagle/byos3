import { env } from "cloudflare:workers";
import { createSessionDb, waitlist } from "@byos3/db";
import { WaitlistJoinInput, type WaitlistJoinResult } from "@byos3/protocol";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { verifyTurnstile } from "#/lib/turnstile";

// Public, unauthenticated server function for the landing-page waitlist form (no auth middleware).
// The web's own data path is server functions, not HTTP /api routes - the only HTTP route is the
// Better Auth handler at /api/auth/*. See agents/docs/web-app.md, api.md.
export const joinWaitlist = createServerFn({ method: "POST" })
  .validator(WaitlistJoinInput)
  .handler(async ({ data }): Promise<WaitlistJoinResult> => {
    const human = await verifyTurnstile(
      (env as { TURNSTILE_SECRET_KEY?: string }).TURNSTILE_SECRET_KEY,
      data.turnstileToken,
      getRequestHeader("cf-connecting-ip") ?? null,
    );
    if (!human) return { ok: false, error: "turnstile_failed" };

    const db = createSessionDb(env.DB);
    const email = data.email.trim().toLowerCase();
    const existing = await db
      .select({ id: waitlist.id })
      .from(waitlist)
      .where(eq(waitlist.email, email))
      .limit(1);
    if (existing.length > 0) return { ok: true, alreadyJoined: true };

    await db
      .insert(waitlist)
      .values({
        id: crypto.randomUUID(),
        email,
        name: data.name ?? null,
        referrer: data.referrer ?? null,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    return { ok: true };
  });
