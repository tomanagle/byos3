import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { getPublicConfig } from "#/fn/config";
import { authClient } from "#/lib/auth-client";

/** GitHub wordmark (lucide ships no brand icons, so inline a minimal Octocat path). */
function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-1.8c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.5A11.5 11.5 0 0 0 23.5 12C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  );
}

/** "Continue with GitHub" - rendered only when GitHub OAuth is configured on this deploy. */
export function GithubButton({ callbackURL = "/" }: { callbackURL?: string }) {
  const cfg = useQuery({
    queryKey: ["public-config"],
    queryFn: () => getPublicConfig(),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [loading, setLoading] = useState(false);

  if (!cfg.data?.githubOAuth) return null;

  async function go() {
    setLoading(true);
    // Redirects to GitHub; only returns here on error.
    await authClient.signIn.social({ provider: "github", callbackURL });
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary text-base font-medium transition-colors hover:bg-accent disabled:opacity-60"
      >
        {loading ? <Loader2 className="size-4 animate-spin" /> : <GithubMark />}
        Continue with GitHub
      </button>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
