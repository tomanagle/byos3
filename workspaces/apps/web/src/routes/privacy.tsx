import { createFileRoute } from "@tanstack/react-router";
import { Clause, LegalPage } from "#/components/legal-page";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="June 26, 2026">
      <p>
        This policy explains what byos3 collects and why. The guiding principle is simple: your
        files stay in your own bucket, and we hold as little as possible. This is a plain-language
        summary intended for review by counsel before launch.
      </p>

      <Clause heading="What we store">
        <p>
          Account data (email, name), workspace and membership records, and file <em>metadata</em>:
          names, folder structure, the change journal, content hashes (SHA-256), and sizes. We store
          your bucket credentials <strong>envelope-encrypted</strong>, used only server-side to sign
          requests. We do <strong>not</strong> store the contents of your files.
        </p>
      </Clause>

      <Clause heading="What we do not do">
        <p>
          Your file bytes transfer directly between your device and your bucket over short-lived
          presigned URLs; they never pass through our servers (the sole future exception is an
          opt-in AI indexing feature, which will be clearly gated). We do not sell your data.
        </p>
      </Clause>

      <Clause heading="Processors we use">
        <p>
          Cloudflare (hosting, compute, and metadata database), Stripe (payments; we never see your
          full card details), and your chosen storage provider (which holds your files under your
          account). Each processes data to provide the Service.
        </p>
      </Clause>

      <Clause heading="Retention and deletion">
        <p>
          We keep metadata while your account is active. Deleting your account removes your byos3
          metadata and stored credentials; your files remain in your bucket under your control.
          Version history is retained per your plan&rsquo;s window.
        </p>
      </Clause>

      <Clause heading="Your rights">
        <p>
          You can access, export, or delete your account data, and disconnect any bucket, at any
          time. For requests or questions: privacy@byos3.com.
        </p>
      </Clause>
    </LegalPage>
  );
}
