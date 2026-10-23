import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | StrataVerze",
  description:
    "How StrataVerze collects, uses and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">
        Privacy Policy
      </h1>
      <p className="text-sm text-gray-500">Last updated: 17 October 2026</p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-gray-900">1. Introduction</h2>
        <p>
          StrataVerze (&ldquo;we&rdquo;, &ldquo;us&rdquo; or &ldquo;our&rdquo;)
          is an Australian strata management platform that helps owners
          corporations, committee members, strata managers and suppliers manage
          their schemes efficiently. We are committed to protecting the privacy
          of your personal information in accordance with the{" "}
          <em>Australian Privacy Act 1988</em> (Cth) and the Australian Privacy
          Principles (APPs).
        </p>
        <p>
          This policy explains what personal information we collect, how we use
          and store it, and your rights regarding that information.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          2. Information We Collect
        </h2>
        <p>We may collect the following categories of personal information:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong>Account information</strong> &ndash; name, email address,
            phone number and password credentials (managed by our authentication
            provider).
          </li>
          <li>
            <strong>Property and lot details</strong> &ndash; scheme name,
            address, lot numbers, entitlements, and strata plan references.
          </li>
          <li>
            <strong>Financial information</strong> &ndash; levy amounts, payment
            records and fund balances associated with your scheme. We do not
            store credit card or bank account numbers directly.
          </li>
          <li>
            <strong>Documents and correspondence</strong> &ndash; files you
            upload (minutes, notices, insurance certificates, compliance
            documents) and announcements or communications within the platform.
          </li>
          <li>
            <strong>Usage data</strong> &ndash; technical information such as
            browser type, IP address, pages visited and timestamps, collected
            automatically when you use the platform.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          3. How We Collect Information
        </h2>
        <p>We collect personal information:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Directly from you when you register, update your profile, or use the platform.</li>
          <li>From your strata manager or committee when they set up your scheme and assign you as a lot owner.</li>
          <li>Automatically through server logs and analytics when you interact with our website.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          4. How We Use Your Information
        </h2>
        <p>We use your personal information to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Provide, maintain and improve the StrataVerze platform.</li>
          <li>Authenticate your identity and manage access to scheme data.</li>
          <li>Send transactional notifications (levy notices, meeting invitations, work order updates).</li>
          <li>Generate activity logs and audit trails for scheme governance.</li>
          <li>Respond to your enquiries and provide support.</li>
          <li>Comply with legal obligations, including strata legislation requirements.</li>
        </ul>
        <p>
          We do not sell or rent your personal information to third parties. We
          do not use your information for automated decision-making or profiling.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          5. Data Storage and Security
        </h2>
        <p>
          Your data is stored in a PostgreSQL database hosted by Supabase, with
          infrastructure located in the Asia-Pacific (Sydney) region. Documents
          and files are stored in Supabase Storage with signed URL access
          controls.
        </p>
        <p>
          We implement industry-standard security measures including encrypted
          connections (TLS), secure authentication tokens, rate limiting,
          content security headers and role-based access controls to protect
          your information from unauthorised access, modification or disclosure.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          6. Sharing Your Information
        </h2>
        <p>We may share your personal information with:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong>Other scheme participants</strong> &ndash; your name and
            contact details may be visible to other members of your strata
            scheme (owners, committee members, the strata manager) as required
            for scheme administration.
          </li>
          <li>
            <strong>Service providers</strong> &ndash; we use trusted
            third-party services for hosting (Vercel), database and storage
            (Supabase), and email delivery (Resend). These providers process
            data on our behalf under contractual obligations to protect your
            information.
          </li>
          <li>
            <strong>Legal requirements</strong> &ndash; we may disclose
            information where required by law, regulation or court order.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          7. Cookies and Tracking
        </h2>
        <p>
          StrataVerze uses essential cookies to maintain your authenticated
          session. We do not use third-party advertising or tracking cookies. No
          personal information is shared with advertising networks.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          8. Your Rights
        </h2>
        <p>Under the Australian Privacy Principles, you have the right to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Access the personal information we hold about you.</li>
          <li>Request correction of any inaccurate or out-of-date information.</li>
          <li>Request deletion of your account and associated personal data, subject to any legal retention obligations.</li>
          <li>Lodge a complaint if you believe your privacy has been breached.</li>
        </ul>
        <p>
          To exercise any of these rights, contact us at{" "}
          <a
            href="mailto:support@strataverze.com"
            className="text-[#00D4BF] underline hover:text-[#00bfad]"
          >
            support@strataverze.com
          </a>
          .
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          9. Data Retention
        </h2>
        <p>
          We retain your personal information for as long as your account is
          active or as needed to provide the platform services. Scheme-related
          records (levies, minutes, compliance items) may be retained for the
          period required under applicable strata legislation. When data is no
          longer required, we will securely delete or de-identify it.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          10. Changes to This Policy
        </h2>
        <p>
          We may update this privacy policy from time to time. Material changes
          will be communicated through the platform or via email. The
          &ldquo;Last updated&rdquo; date at the top of this page indicates when
          the policy was most recently revised.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">11. Contact Us</h2>
        <p>
          If you have questions about this privacy policy or wish to make a
          complaint, please contact us:
        </p>
        <p className="mt-2">
          <strong>Email:</strong>{" "}
          <a
            href="mailto:support@strataverze.com"
            className="text-[#00D4BF] underline hover:text-[#00bfad]"
          >
            support@strataverze.com
          </a>
        </p>
        <p>
          If you are not satisfied with our response, you may lodge a complaint
          with the{" "}
          <a
            href="https://www.oaic.gov.au"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#00D4BF] underline hover:text-[#00bfad]"
          >
            Office of the Australian Information Commissioner (OAIC)
          </a>
          .
        </p>
      </section>
    </article>
  );
}
