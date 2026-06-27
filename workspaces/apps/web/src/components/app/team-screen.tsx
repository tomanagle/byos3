import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Copy, Loader2, Trash2, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { authClient } from "#/lib/auth-client";
import { useWorkspace } from "./app-shell";

// Invitable org roles (owner is reserved for the creator). Mirrors @byos3/core/authz NAMESPACE_ROLES.
const ROLES = ["reader", "writer", "admin"] as const;
type InviteRole = (typeof ROLES)[number];

interface Member {
  id: string;
  userId: string;
  role: string;
  user?: { email?: string | null; name?: string | null } | null;
}
interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
}

/**
 * Team: the org's members + pending invitations, gated by the subscription's seats. Inviting beyond
 * the seat count is blocked by Better Auth itself (membershipLimit/invitationLimit, see @byos3/auth);
 * here we mirror that in the UI and point at Billing to add seats. We have no email provider, so a
 * pending invite shows a copyable accept link the inviter shares manually. See billing.md, rbac.md.
 */
export function TeamScreen() {
  const { billingEnabled } = useWorkspace();
  const qc = useQueryClient();
  const { data: session } = authClient.useSession();
  const myUserId = session?.user?.id;

  const orgs = useQuery({
    queryKey: ["orgs"],
    queryFn: async () => {
      const r = await authClient.organization.list();
      if (r.error) throw new Error(r.error.message ?? "failed");
      return r.data;
    },
  });
  const orgId = orgs.data?.[0]?.id;

  const org = useQuery({
    queryKey: ["org-full", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const r = await authClient.organization.getFullOrganization({
        query: { organizationId: orgId as string },
      });
      if (r.error) throw new Error(r.error.message ?? "failed");
      return r.data;
    },
  });

  const subs = useQuery({
    queryKey: ["subscriptions", orgId],
    enabled: Boolean(orgId) && billingEnabled,
    queryFn: async () => {
      const r = await authClient.subscription.list({ query: { referenceId: orgId as string } });
      if (r.error) throw new Error(r.error.message ?? "failed");
      return r.data;
    },
  });

  const members = (org.data?.members ?? []) as Member[];
  const invites = ((org.data?.invitations ?? []) as Invitation[]).filter(
    (i) => i.status === "pending",
  );
  const activeSub = subs.data?.find((s) => s.status === "active" || s.status === "trialing");
  // Billing off (self-hosted, no Stripe) => unlimited seats; else the active sub's seats (free = 1).
  const seats = billingEnabled ? (activeSub?.seats ?? 1) : Number.POSITIVE_INFINITY;
  const used = members.length + invites.length;
  const seatsLeft = Math.max(0, seats - used);
  const myRole = members.find((m) => m.userId === myUserId)?.role;
  const canManage = myRole === "owner" || myRole === "admin";

  const refresh = () => qc.invalidateQueries({ queryKey: ["org-full", orgId] });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("writer");
  const invite = useMutation({
    mutationFn: async () => {
      const r = await authClient.organization.inviteMember({
        email: email.trim(),
        role,
        organizationId: orgId as string,
      });
      if (r.error) throw new Error(r.error.message ?? "invite failed");
    },
    onSuccess: () => {
      setEmail("");
      refresh();
    },
  });

  const loading = orgs.isLoading || org.isLoading;

  return (
    <div className="container py-6">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold tracking-tight">Team</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Invite people into your workspace. Each member takes a seat; manage how many in{" "}
          {billingEnabled ? (
            <Link to="/billing" className="text-primary hover:underline">
              Billing
            </Link>
          ) : (
            "Billing"
          )}
          .
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading team…
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <span className="text-sm">
              {billingEnabled ? (
                <>
                  <span className="font-mono tabular-nums">{used}</span> of{" "}
                  <span className="font-mono tabular-nums">{seats}</span> seat
                  {seats === 1 ? "" : "s"} used
                </>
              ) : (
                <>
                  <span className="font-mono tabular-nums">{members.length}</span> member
                  {members.length === 1 ? "" : "s"} · unlimited (self-hosted)
                </>
              )}
            </span>
            {billingEnabled && (
              <Link to="/billing" className="text-sm font-medium text-primary hover:underline">
                {seatsLeft > 0 ? "Manage seats" : "Add seats"}
              </Link>
            )}
          </div>

          {canManage && (
            <div className="mb-6 rounded-xl border border-border bg-card p-5">
              <span className="text-sm font-medium text-muted-foreground">Invite a teammate</span>
              {seatsLeft === 0 ? (
                <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                  All {seats} seat{seats === 1 ? "" : "s"} are in use.{" "}
                  {billingEnabled ? (
                    <Link to="/billing" className="text-primary hover:underline">
                      Add a seat
                    </Link>
                  ) : (
                    "Add a seat in Billing"
                  )}{" "}
                  to invite more people.
                </p>
              ) : (
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teammate@example.com"
                    className="h-9 flex-1 rounded-lg border border-border bg-secondary/60 px-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  />
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as InviteRole)}
                    className="h-9 rounded-lg border border-border bg-secondary/60 px-2.5 text-sm outline-none focus:border-primary/50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => invite.mutate()}
                    disabled={invite.isPending || !email.trim()}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:brightness-110 disabled:opacity-60"
                  >
                    {invite.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <UserPlus className="size-4" />
                    )}
                    Invite
                  </button>
                </div>
              )}
              {invite.isError && (
                <p className="mt-2 text-sm text-destructive">{invite.error.message}</p>
              )}
            </div>
          )}

          {invites.length > 0 && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">
                Pending invitations
              </h2>
              <ul className="flex flex-col gap-2">
                {invites.map((inv) => (
                  <InviteRow key={inv.id} invite={inv} canManage={canManage} onChange={refresh} />
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              Members{members.length ? ` (${members.length})` : ""}
            </h2>
            <ul className="flex flex-col gap-2">
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  orgId={orgId as string}
                  canManage={canManage}
                  isSelf={m.userId === myUserId}
                  onChange={refresh}
                />
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function InviteRow({
  invite,
  canManage,
  onChange,
}: {
  invite: Invitation;
  canManage: boolean;
  onChange: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const cancel = useMutation({
    mutationFn: async () => {
      const r = await authClient.organization.cancelInvitation({ invitationId: invite.id });
      if (r.error) throw new Error(r.error.message ?? "failed");
    },
    onSuccess: onChange,
  });
  const link = `${window.location.origin}/accept-invitation?id=${invite.id}`;
  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <span className="block truncate text-base">{invite.email}</span>
        <span className="font-mono text-xs text-muted-foreground">invited · {invite.role}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:bg-accent"
        >
          {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy link"}
        </button>
        {canManage && (
          <button
            type="button"
            aria-label="Cancel invitation"
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
            className="inline-flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-40"
          >
            {cancel.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <X className="size-4" />
            )}
          </button>
        )}
      </div>
    </li>
  );
}

function MemberRow({
  member,
  orgId,
  canManage,
  isSelf,
  onChange,
}: {
  member: Member;
  orgId: string;
  canManage: boolean;
  isSelf: boolean;
  onChange: () => void;
}) {
  const remove = useMutation({
    mutationFn: async () => {
      const r = await authClient.organization.removeMember({
        memberIdOrEmail: member.id,
        organizationId: orgId,
      });
      if (r.error) throw new Error(r.error.message ?? "failed");
    },
    onSuccess: onChange,
  });
  const label = member.user?.email ?? member.user?.name ?? member.userId;
  const removable = canManage && !isSelf && member.role !== "owner";
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <span className="block truncate text-base">
          {label} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{member.role}</span>
      </div>
      {removable && (
        <button
          type="button"
          aria-label="Remove member"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:border-destructive/40 hover:text-destructive disabled:opacity-40"
        >
          {remove.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </button>
      )}
    </li>
  );
}
