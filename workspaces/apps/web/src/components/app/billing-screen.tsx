import { CURRENCY, PLAN_NAME, PRICE_CENTS } from "@byos3/protocol";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Loader2, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { authClient } from "#/lib/auth-client";
import { cn } from "#/lib/utils";
import { useWorkspace } from "./app-shell";

const usd = (cents: number) => `$${(cents / 100).toFixed(0)}`;

const FREE_FEATURES = ["1 volume", "1 device", "30-day version history", "Live sync"];
const PAID_FEATURES = [
  "Unlimited volumes",
  "Unlimited devices",
  "Full version history",
  "Sharing + roles (per seat)",
  "API keys + AI quota",
];

/**
 * Billing: shows the current plan and lets an owner upgrade (per-seat, monthly/annual) via Stripe
 * Checkout or open the billing portal. Subscriptions are scoped to the namespace/org (referenceId),
 * so we resolve the user's org first. See agents/docs/billing.md.
 */
export function BillingScreen() {
  const { billingEnabled } = useWorkspace();
  const [annual, setAnnual] = useState(true);
  const [seats, setSeats] = useState(1);

  const orgs = useQuery({
    queryKey: ["orgs"],
    enabled: billingEnabled,
    queryFn: async () => {
      const r = await authClient.organization.list();
      if (r.error) throw new Error(r.error.message ?? "failed");
      return r.data;
    },
  });
  const orgId = orgs.data?.[0]?.id;

  const subs = useQuery({
    queryKey: ["subscriptions", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const r = await authClient.subscription.list({ query: { referenceId: orgId as string } });
      if (r.error) throw new Error(r.error.message ?? "failed");
      return r.data;
    },
  });
  const active = subs.data?.find((s) => s.status === "active" || s.status === "trialing");

  const upgrade = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("no workspace");
      const r = await authClient.subscription.upgrade({
        plan: PLAN_NAME,
        referenceId: orgId,
        seats,
        annual,
        successUrl: `${window.location.origin}/billing?ok=1`,
        cancelUrl: `${window.location.origin}/billing`,
      });
      if (r.error) throw new Error(r.error.message ?? "checkout failed");
    },
  });
  const portal = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("no workspace");
      const r = await authClient.subscription.billingPortal({
        referenceId: orgId,
        returnUrl: `${window.location.origin}/billing`,
      });
      if (r.error) throw new Error(r.error.message ?? "portal failed");
    },
  });

  const monthlyEach = usd(PRICE_CENTS.monthly);
  const annualEach = usd(PRICE_CENTS.annual);
  const perSeat = annual ? annualEach : monthlyEach;
  const loading = orgs.isLoading || subs.isLoading;

  if (!billingEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-3 text-base text-muted-foreground">
          Billing isn&apos;t enabled in this environment, so everything runs on the free tier -
          connect buckets and sync files with no subscription. Paid plans appear once a Stripe key
          is configured.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Billing</h1>
      <p className="mt-1 text-base text-muted-foreground">
        Storage is your own bucket, so we charge for the service - per seat, in{" "}
        {CURRENCY.toUpperCase()}.
      </p>

      {loading ? (
        <div className="mt-8 grid h-40 place-items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : active ? (
        <ActivePlan
          seats={active.seats ?? 1}
          onManage={() => portal.mutate()}
          managing={portal.isPending}
          error={portal.isError}
        />
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <PlanCard title="Free" price="$0" cadence="forever" features={FREE_FEATURES} current />
          <PlanCard
            title="byos3"
            price={`${perSeat}`}
            cadence={`per seat / ${annual ? "year" : "month"}`}
            features={PAID_FEATURES}
            highlight
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Billing</span>
              <div className="flex rounded-lg border border-border bg-card p-0.5 text-sm">
                <Toggle on={!annual} onClick={() => setAnnual(false)}>
                  Monthly
                </Toggle>
                <Toggle on={annual} onClick={() => setAnnual(true)}>
                  Annual <span className="text-primary">-17%</span>
                </Toggle>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Seats</span>
              <div className="flex items-center gap-2">
                <Stepper label="Remove seat" onClick={() => setSeats((s) => Math.max(1, s - 1))}>
                  <Minus className="size-4" />
                </Stepper>
                <span className="w-6 text-center font-mono text-base tabular-nums">{seats}</span>
                <Stepper label="Add seat" onClick={() => setSeats((s) => s + 1)}>
                  <Plus className="size-4" />
                </Stepper>
              </div>
            </div>
            <button
              type="button"
              onClick={() => upgrade.mutate()}
              disabled={upgrade.isPending}
              className="mt-1 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-base font-semibold text-primary-foreground transition-all hover:brightness-110 disabled:opacity-60"
            >
              {upgrade.isPending && <Loader2 className="size-4 animate-spin" />}
              Upgrade {seats > 1 ? `${seats} seats` : ""}
            </button>
            {upgrade.isError && (
              <p className="text-sm text-destructive">
                Couldn&apos;t start checkout. Billing may not be configured in this environment.
              </p>
            )}
          </PlanCard>
        </div>
      )}
    </div>
  );
}

function ActivePlan({
  seats,
  onManage,
  managing,
  error,
}: {
  seats: number;
  onManage: () => void;
  managing: boolean;
  error: boolean;
}) {
  return (
    <div className="mt-8 rounded-2xl border border-primary/30 bg-primary/[0.07] p-6">
      <div className="flex items-center gap-2 text-primary">
        <Check className="size-5" />
        <span className="font-display text-lg font-semibold">byos3 - active</span>
      </div>
      <p className="mt-2 text-base text-muted-foreground">
        {seats} seat{seats === 1 ? "" : "s"}. Manage seats, switch monthly/annual, update your card,
        or cancel in the billing portal.
      </p>
      <button
        type="button"
        onClick={onManage}
        disabled={managing}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-secondary px-4 text-base font-medium hover:bg-accent disabled:opacity-60"
      >
        {managing ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <ExternalLink className="size-4" />
        )}
        Manage billing
      </button>
      {error && <p className="mt-2 text-sm text-destructive">Couldn&apos;t open the portal.</p>}
    </div>
  );
}

function PlanCard({
  title,
  price,
  cadence,
  features,
  current,
  highlight,
  children,
}: {
  title: string;
  price: string;
  cadence: string;
  features: string[];
  current?: boolean;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border p-6",
        highlight ? "border-primary/40 bg-card" : "border-border bg-card/50",
      )}
    >
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
          {current && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Current
            </span>
          )}
        </div>
        <p className="mt-1">
          <span className="font-display text-3xl font-bold">{price}</span>{" "}
          <span className="text-sm text-muted-foreground">{cadence}</span>
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-base text-foreground/90">
            <Check className="size-4 shrink-0 text-primary" /> {f}
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors",
        on ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Stepper({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}
