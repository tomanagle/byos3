import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "#/lib/utils";
import { authClient } from "#/lib/auth-client";

interface Org {
  id: string;
  name: string;
  slug: string;
}

/**
 * Workspace (organization) switcher. A user can belong to several orgs - their lazily-created
 * personal one and any team they were invited to (rbac.md, billing.md). The active org drives the
 * whole workspace (files, volumes, keys, team, billing), so switching pins a new active org on the
 * session and refetches everything namespace-scoped. Shows just the name when there's only one org.
 */
export function OrgSwitcher() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: session } = authClient.useSession();
  const activeId = (session?.session as { activeOrganizationId?: string | null } | undefined)
    ?.activeOrganizationId;

  const orgs = useQuery({
    queryKey: ["orgs"],
    queryFn: async (): Promise<Org[]> => {
      const r = await authClient.organization.list();
      if (r.error) throw new Error(r.error.message ?? "failed");
      return (r.data ?? []) as Org[];
    },
  });

  // The ["orgs"] key is shared with billing/team screens (which cache the raw list), so be defensive:
  // tolerate a non-array or null entries rather than crashing the rail.
  const list: Org[] = Array.isArray(orgs.data)
    ? orgs.data.filter((o): o is Org => o != null && typeof o.id === "string")
    : [];
  const active = list.find((o) => o.id === activeId) ?? list[0];

  const switchTo = useMutation({
    mutationFn: async (id: string) => {
      const r = await authClient.organization.setActive({ organizationId: id });
      if (r.error) throw new Error(r.error.message ?? "failed to switch");
    },
    onSuccess: async () => {
      setOpen(false);
      // The active org changed server-side; refetch everything namespace-scoped, and reset to files
      // (a volume from the previous org won't exist in the new one).
      await qc.invalidateQueries();
      void navigate({ to: "/" });
    },
  });

  const label = active?.name ?? "Workspace";
  const single = list.length <= 1;

  return (
    <div className="relative px-2.5 pt-2.5">
      <button
        type="button"
        onClick={() => !single && setOpen((o) => !o)}
        aria-haspopup={single ? undefined : "listbox"}
        aria-expanded={single ? undefined : open}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left",
          single ? "cursor-default" : "hover:bg-secondary/60",
        )}
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/15 font-display text-xs font-bold text-primary">
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{label}</span>
          <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
            Workspace
          </span>
        </span>
        {switchTo.isPending ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          !single && <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && !single && (
        <>
          {/* click-away */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <ul className="absolute inset-x-2.5 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl">
            {list.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => switchTo.mutate(o.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-secondary/60"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/15 font-display text-xs font-bold text-primary">
                    {o.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  {o.id === active?.id && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
