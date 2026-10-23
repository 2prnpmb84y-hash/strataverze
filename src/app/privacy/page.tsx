import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "StrataVerze Privacy Policy. How we collect, use, and protect your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="py-20 sm:py-28">
      <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-[var(--muted)]">
            Last updated: October 2026
          </p>
        </header>

        <div className="space-y-10 leading-relaxed text-[var(--muted)]">
          {/* Introduction */}
          <section>
            <p>
              StrataVerze Pty Ltd (ABN 25 680 401 450) (&quot;StrataVerze&quot;,
              &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is committed to
              protecting the privacy of your personal information. This Privacy
              Policy explains how we collect, use, disclose, and safeguard your
              information when you use the StrataVerze platform and related
              services.
            </p>
            <p className="mt-4">
              We are bound by the Australian Privacy Act 1988 (Cth) and the
              Australian Privacy Principles (APPs). This policy should be read
              alongside any other applicable terms and conditions or contractual
              arrangements.
            </p>
          </section>

          {/* Information We Collect */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              1. Information We Collect
            </h2>
            <p>
              We may collect the following types of personal information:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-[var(--foreground)]">
                  Identity information:
                </strong>{" "}
                your name, email address, phone number, and postal address.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  Account information:
                </strong>{" "}
                login credentials, role within your owners corporation or strata
                scheme, and lot details.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  Financial information:
                </strong>{" "}
                levy payment details, bank account or payment card information
                processed through our third-party payment providers.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  Usage information:
                </strong>{" "}
                how you interact with the platform, including pages visited,
                features used, and device and browser information.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  Communications:
                </strong>{" "}
                messages, correspondence, and documents you submit through the
                platform.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  Supplier information:
                </strong>{" "}
                business name, ABN, licences, insurance details, and trade
                qualifications for registered suppliers.
              </li>
            </ul>
          </section>

          {/* How We Use Your Information */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              2. How We Use Your Information
            </h2>
            <p>We use your personal information to:</p>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>
                Provide, maintain, and improve the StrataVerze platform and its
                features.
              </li>
              <li>
                Process levy payments, generate financial reports, and manage
                scheme accounting.
              </li>
              <li>
                Facilitate communication between lot owners, committee members,
                and suppliers.
              </li>
              <li>
                Verify your identity and manage your account.
              </li>
              <li>
                Send you service-related notices, updates, and security alerts.
              </li>
              <li>
                Respond to your enquiries and provide customer support.
              </li>
              <li>
                Comply with legal obligations, including requirements under the
                Strata Schemes Management Act 2015 (NSW).
              </li>
              <li>
                Analyse usage patterns to improve platform functionality and
                user experience.
              </li>
            </ul>
          </section>

          {/* Information Sharing */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              3. Information Sharing
            </h2>
            <p>
              We do not sell your personal information. We may share your
              information in the following circumstances:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-[var(--foreground)]">
                  Within your strata scheme:
                </strong>{" "}
                certain information (such as your name and lot number) may be
                visible to other members of your owners corporation as required
                for scheme administration.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  Service providers:
                </strong>{" "}
                we use trusted third-party providers for payment processing,
                hosting, email delivery, and analytics. These providers are
                contractually bound to protect your information.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  Legal requirements:
                </strong>{" "}
                we may disclose information where required by law, regulation,
                legal process, or enforceable governmental request.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  Business transfers:
                </strong>{" "}
                in the event of a merger, acquisition, or sale of assets, your
                information may be transferred as part of that transaction.
              </li>
            </ul>
          </section>

          {/* Data Security */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              4. Data Security
            </h2>
            <p>
              We take reasonable steps to protect your personal information from
              misuse, interference, loss, unauthorised access, modification, and
              disclosure. Our security measures include encryption of data in
              transit and at rest, access controls, and regular security
              assessments.
            </p>
            <p className="mt-4">
              While we strive to protect your information, no method of
              electronic storage or transmission is completely secure. We cannot
              guarantee absolute security but are committed to maintaining
              industry-standard protections.
            </p>
          </section>

          {/* Your Rights */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              5. Your Rights
            </h2>
            <p>
              Under the Australian Privacy Principles, you have the right to:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-[var(--foreground)]">
                  Access:
                </strong>{" "}
                request access to the personal information we hold about you.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  Correction:
                </strong>{" "}
                request correction of any inaccurate, out-of-date, incomplete,
                or misleading information.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  Complaints:
                </strong>{" "}
                lodge a complaint if you believe we have breached the Australian
                Privacy Principles.
              </li>
            </ul>
            <p className="mt-4">
              To exercise any of these rights, please contact us using the
              details below. We will respond to your request within a reasonable
              timeframe, generally within 30 days.
            </p>
          </section>

          {/* Cookies */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              6. Cookies and Tracking Technologies
            </h2>
            <p>
              We use cookies and similar technologies to enhance your experience
              on the platform. These may include:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-[var(--foreground)]">
                  Essential cookies:
                </strong>{" "}
                necessary for the platform to function, such as authentication
                and session management.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">
                  Analytics cookies:
                </strong>{" "}
                help us understand how users interact with the platform so we
                can improve it.
              </li>
            </ul>
            <p className="mt-4">
              You can manage your cookie preferences through your browser
              settings. Disabling certain cookies may affect the functionality of
              the platform.
            </p>
          </section>

          {/* Changes to This Policy */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              7. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time to reflect
              changes in our practices, technology, or legal requirements. We
              will notify you of any material changes by posting the updated
              policy on the platform and, where appropriate, by email. The
              &quot;Last updated&quot; date at the top of this page indicates
              when the policy was last revised.
            </p>
          </section>

          {/* Contact Us */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              8. Contact Us
            </h2>
            <p>
              If you have any questions about this Privacy Policy, wish to make
              a complaint, or would like to exercise your privacy rights, please
              contact us:
            </p>
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-6">
              <p className="font-medium text-[var(--foreground)]">
                StrataVerze Pty Ltd
              </p>
              <p className="mt-1">ABN 25 680 401 450</p>
              <p className="mt-1">
                Email:{" "}
                <a
                  href="mailto:privacy@strataverze.com"
                  className="text-brand-teal hover:text-brand-teal-dark"
                >
                  privacy@strataverze.com
                </a>
              </p>
            </div>
            <p className="mt-4">
              If you are not satisfied with our response, you may lodge a
              complaint with the Office of the Australian Information
              Commissioner (OAIC) at{" "}
              <a
                href="https://www.oaic.gov.au"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-teal hover:text-brand-teal-dark"
              >
                www.oaic.gov.au
              </a>
              .
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
