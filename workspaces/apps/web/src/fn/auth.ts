import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "#/server/auth";

export interface Me {
  id: string;
  email: string;
  name: string;
}

/**
 * Read the current session WITHOUT throwing (unlike `authMiddleware`). Used by the `/app` route
 * guard: returns the user, or null when signed out → the loader redirects to /sign-in.
 */
export const getMe = createServerFn({ method: "GET" }).handler(async (): Promise<Me | null> => {
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
    query: { disableCookieCache: true },
  });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
});
