import { env } from "cloudflare:workers";
import { createSessionDb, userPreferences } from "@byos3/db";
import { SavePreferencesInput, type UserPreferences } from "@byos3/protocol";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { authMiddleware } from "#/lib/middleware";

// Per-user UI preferences. The web's source of truth is this server fn (D1 `user_preferences`); the
// client caches the result in localStorage for instant first paint. See web-app.md.

const DEFAULTS: UserPreferences = { fileView: "list", gridSize: "large" };

export const getPreferences = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<UserPreferences> => {
    context.span.set({ fn: "getPreferences" });
    const db = createSessionDb(env.DB);
    const rows = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, context.ctx.principal.userId))
      .limit(1);
    const row = rows[0];
    return row ? { fileView: row.fileView, gridSize: row.gridSize } : DEFAULTS;
  });

export const savePreferences = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(SavePreferencesInput)
  .handler(async ({ context, data }): Promise<UserPreferences> => {
    context.span.set({ fn: "savePreferences", "pref.file_view": data.fileView });
    const db = createSessionDb(env.DB);
    const userId = context.ctx.principal.userId;
    const now = Date.now();
    await db
      .insert(userPreferences)
      .values({ userId, fileView: data.fileView, gridSize: data.gridSize, updatedAt: now })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: { fileView: data.fileView, gridSize: data.gridSize, updatedAt: now },
      });
    return { fileView: data.fileView, gridSize: data.gridSize };
  });
