import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

/** Browser auth client (sign-in/up, organization). Safe to import client-side. */
export const authClient = createAuthClient({
  plugins: [organizationClient()],
});
