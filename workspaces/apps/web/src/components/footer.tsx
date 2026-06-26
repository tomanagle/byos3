import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getPublicConfig } from "#/fn/config";
import { cn } from "#/lib/utils";

/**
 * Public site footer: tagline + Docs / Terms / Privacy. The Docs link points at the `docs.`
 * subdomain of this deploy's apex, derived server-side from APP_DOMAIN (getPublicConfig). Shared by
 * the landing page and the policy pages.
 */
export function Footer({ className }: { className?: string }) {
  const { data: config } = useQuery({
    queryKey: ["public-config"],
    queryFn: () => getPublicConfig(),
  });
  const docsUrl = config?.docsUrl ?? "https://docs.byos3.com";

  return (
    <footer className={cn("relative z-10 border-t border-border/70", className)}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground">
        <span className="font-mono uppercase tracking-wide">
          your files, your bucket, your rules
        </span>
        <nav className="flex items-center gap-4">
          <a href={docsUrl} className="hover:text-foreground">
            Docs
          </a>
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
