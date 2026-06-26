-- Better Auth Stripe plugin: per-org (namespace) subscriptions + the user's Stripe customer id.
-- Billing is scoped to the organization (reference_id); seats = paid member count. See billing.md.
ALTER TABLE user ADD COLUMN stripe_customer_id text;

CREATE TABLE subscription (
  id text PRIMARY KEY NOT NULL,
  plan text NOT NULL,
  reference_id text NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'incomplete',
  period_start integer,
  period_end integer,
  cancel_at_period_end integer,
  seats integer,
  trial_start integer,
  trial_end integer
);

CREATE INDEX subscription_reference_id_idx ON subscription (reference_id);
