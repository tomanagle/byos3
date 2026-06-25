import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useState } from "react";
import { WaitingScreen } from "#/components/waiting-screen";
import { getMe } from "#/fn/auth";
import { SHOW_WAITING_SCREEN } from "#/lib/flags";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  // Resolve the session once, here, so every route can branch on `context.user` (logged-in vs
  // landing) without re-querying. Skipped entirely in waitlist mode. See routing.md.
  beforeLoad: async () => {
    if (SHOW_WAITING_SCREEN) return { user: null };
    return { user: await getMe() };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "byos3 - your files, your bucket, your rules" },
      {
        name: "description",
        content:
          "A Dropbox-style sync app that stores everything in storage you own: S3, Cloudflare R2, or Backblaze.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
  shellComponent: RootDocument,
});

/** Waitlist mode takes over every route; otherwise render the matched route. */
function RootComponent() {
  if (SHOW_WAITING_SCREEN) return <WaitingScreen />;
  return <Outlet />;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{ position: "bottom-right" }}
            plugins={[{ name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> }]}
          />
        )}
        <Scripts />
      </body>
    </html>
  );
}
