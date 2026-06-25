import { z } from "zod";

/**
 * Phase 0 - waitlist join contract. Shared by the `/api/v1/waitlist` server route
 * and any client. See agents/docs/api.md (API-first) and plans/phase-0-landing-waitlist.md.
 */
export const WaitlistJoinInput = z.object({
  email: z.email().max(320),
  name: z.string().trim().min(1).max(120).optional(),
  referrer: z.string().max(2048).optional(),
  /** Cloudflare Turnstile token from the widget. */
  turnstileToken: z.string().min(1).max(8192),
});
export type WaitlistJoinInput = z.infer<typeof WaitlistJoinInput>;

export const WaitlistJoinResult = z.object({
  ok: z.boolean(),
  alreadyJoined: z.boolean().optional(),
  error: z.string().optional(),
});
export type WaitlistJoinResult = z.infer<typeof WaitlistJoinResult>;

export * from "./storage";
export * from "./sync";
