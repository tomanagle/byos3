import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "#/lib/utils";

const REPO = "tomanagle/byos3";
const REPO_URL = `https://github.com/${REPO}`;

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}

/**
 * "Star on GitHub" link with the live stargazer count. The count is fetched client-side from the
 * public GitHub API (CORS-enabled, unauthenticated); if it's unavailable the link still renders
 * without a number. Points at the canonical upstream repo.
 */
export function GitHubStar({ className }: { className?: string }) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${REPO}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { stargazers_count?: number } | null) => {
        if (typeof data?.stargazers_count === "number") setStars(data.stargazers_count);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <a
      href={REPO_URL}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Star byos3 on GitHub"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        className,
      )}
    >
      <Star className="size-3.5" strokeWidth={2.2} />
      <span>Star</span>
      {stars !== null && (
        <span className="tabular-nums text-xs text-foreground/70">{formatCount(stars)}</span>
      )}
    </a>
  );
}
