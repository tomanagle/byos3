import { createFileRoute } from "@tanstack/react-router";
import { Clause, LegalPage } from "#/components/legal-page";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="June 26, 2026">
      <p>
        These terms govern your use of byos3 (the &ldquo;Service&rdquo;). By creating an account or
        using the Service you agree to them. This is a plain-language summary intended for review by
        counsel before launch.
      </p>

      <Clause heading="What byos3 does">
        <p>
          byos3 is a file sync and sharing service that operates on object storage <em>you</em>{" "}
          connect (an S3-compatible bucket you own). We provide the coordination layer: the sync
          engine, sharing, version history, and API. We never sell or provide the underlying
          storage.
        </p>
      </Clause>

      <Clause heading="Your storage and your data">
        <p>
          Your files live in your own bucket. byos3 stores only metadata (file names, the journal of
          changes, content hashes) and your envelope-encrypted bucket credentials. You are
          responsible for your storage provider account, its costs, and its availability. You may
          disconnect a bucket at any time; your files remain in your bucket.
        </p>
      </Clause>

      <Clause heading="Accounts and acceptable use">
        <p>
          Keep your credentials secure; you are responsible for activity under your account. Do not
          use the Service to store or distribute unlawful content, to infringe others&rsquo; rights,
          or to abuse the platform (including circumventing usage limits or rate limits).
        </p>
      </Clause>

      <Clause heading="Plans, billing, and seats">
        <p>
          Paid plans are billed per seat in USD through Stripe, monthly or annually, and renew
          automatically until cancelled. A seat is a member of your workspace. You can cancel or
          change your plan at any time from the billing portal; access continues until the end of
          the paid period. Fees are non-refundable except where required by law.
        </p>
      </Clause>

      <Clause heading="Service availability and changes">
        <p>
          We aim for high availability but provide the Service &ldquo;as is&rdquo; without warranty.
          We may change or discontinue features with reasonable notice. Because your data lives in
          your bucket, you retain access to your files independent of the Service.
        </p>
      </Clause>

      <Clause heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, byos3 is not liable for indirect or consequential
          damages, or for loss of data in your storage provider. Our aggregate liability is limited
          to the amount you paid us in the prior twelve months.
        </p>
      </Clause>

      <Clause heading="Contact">
        <p>Questions about these terms: support@byos3.com.</p>
      </Clause>
    </LegalPage>
  );
}
