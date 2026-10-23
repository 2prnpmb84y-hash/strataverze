import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "StrataVerze Terms of Service. The terms and conditions governing your use of the StrataVerze platform.",
};

export default function TermsOfServicePage() {
  return (
    <main className="py-20 sm:py-28">
      <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Terms of Service
          </h1>
          <p className="mt-4 text-[var(--muted)]">
            Last updated: October 2026
          </p>
        </header>

        <div className="space-y-10 leading-relaxed text-[var(--muted)]">
          {/* Acceptance of Terms */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              1. Acceptance of Terms
            </h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) constitute a legally
              binding agreement between you and StrataVerze Pty Ltd (ABN 25 680
              401 450, ACN 680 401 450) (&quot;StrataVerze&quot;, &quot;we&quot;,
              &quot;us&quot;, or &quot;our&quot;). By accessing or using the
              StrataVerze platform (&quot;the Service&quot;), you agree to be
              bound by these Terms.
            </p>
            <p className="mt-4">
              If you are using the Service on behalf of an owners corporation,
              strata committee, or other organisation, you represent that you
              have the authority to bind that entity to these Terms. If you do
              not agree to these Terms, you must not use the Service.
            </p>
          </section>

          {/* The Service */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              2. The Service
            </h2>
            <p>
              StrataVerze is a strata management platform designed for owners
              corporations in New South Wales, Australia. The Service provides
              tools for scheme administration, financial management, meeting
              coordination, document storage, maintenance management, and
              supplier engagement.
            </p>
            <p className="mt-4">
              We reserve the right to modify, suspend, or discontinue any part
              of the Service at any time, with reasonable notice where
              practicable. We will endeavour to provide advance notice of any
              material changes that affect your use of the Service.
            </p>
          </section>

          {/* Your Account */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              3. Your Account
            </h2>
            <p>
              To use the Service, you must create an account and provide
              accurate, complete, and current information. You are responsible
              for:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>
                Maintaining the confidentiality of your login credentials.
              </li>
              <li>
                All activities that occur under your account.
              </li>
              <li>
                Notifying us immediately of any unauthorised use of your
                account.
              </li>
              <li>
                Keeping your account information up to date.
              </li>
            </ul>
            <p className="mt-4">
              We may suspend or terminate your account if we reasonably believe
              you have violated these Terms or if your account has been
              compromised.
            </p>
          </section>

          {/* Acceptable Use */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              4. Acceptable Use
            </h2>
            <p>When using the Service, you agree not to:</p>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>
                Use the Service for any unlawful purpose or in violation of any
                applicable law or regulation.
              </li>
              <li>
                Interfere with or disrupt the Service, servers, or networks
                connected to the Service.
              </li>
              <li>
                Attempt to gain unauthorised access to any part of the Service
                or other users&apos; accounts.
              </li>
              <li>
                Upload or transmit viruses, malware, or other harmful code.
              </li>
              <li>
                Use the Service to harass, abuse, or harm other users.
              </li>
              <li>
                Scrape, crawl, or use automated means to access the Service
                without our express written consent.
              </li>
              <li>
                Misrepresent your identity, role, or authority within a strata
                scheme.
              </li>
            </ul>
          </section>

          {/* Intellectual Property */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              5. Intellectual Property
            </h2>
            <p>
              The Service, including its design, features, code, documentation,
              and branding, is owned by StrataVerze and is protected by
              Australian and international intellectual property laws. Nothing in
              these Terms grants you any right, title, or interest in our
              intellectual property except the limited licence to use the Service
              in accordance with these Terms.
            </p>
            <p className="mt-4">
              You retain ownership of any content you upload to the Service
              (such as documents, images, and correspondence). By uploading
              content, you grant us a limited licence to store, process, and
              display that content as necessary to provide the Service.
            </p>
          </section>

          {/* Fees and Payment */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              6. Fees and Payment
            </h2>
            <p>
              Access to certain features of the Service may require payment of
              fees. Where fees apply, they will be clearly communicated before
              you incur any charges. All fees are quoted in Australian dollars
              and are inclusive of GST unless otherwise stated.
            </p>
            <p className="mt-4">
              We reserve the right to change our fees with reasonable notice.
              Any fee changes will not affect the current billing period for
              existing subscribers.
            </p>
          </section>

          {/* Limitation of Liability */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              7. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by law, StrataVerze shall not be
              liable for any indirect, incidental, special, consequential, or
              punitive damages, including but not limited to loss of profits,
              data, or goodwill, arising from your use of or inability to use
              the Service.
            </p>
            <p className="mt-4">
              Nothing in these Terms excludes, restricts, or modifies any
              consumer guarantee, right, or remedy conferred on you by the
              Australian Consumer Law (Schedule 2 of the Competition and
              Consumer Act 2010 (Cth)) or any other applicable law that cannot
              be excluded, restricted, or modified by agreement.
            </p>
            <p className="mt-4">
              Where our liability cannot be excluded, our total liability to you
              for all claims arising under or in connection with these Terms is
              limited to the amount you have paid to us for the Service in the
              twelve (12) months preceding the claim.
            </p>
          </section>

          {/* Indemnity */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              8. Indemnity
            </h2>
            <p>
              You agree to indemnify and hold harmless StrataVerze, its
              directors, officers, employees, and agents from any claims,
              losses, damages, liabilities, and expenses (including reasonable
              legal fees) arising from your use of the Service, your breach of
              these Terms, or your violation of any law or the rights of a third
              party.
            </p>
          </section>

          {/* Termination */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              9. Termination
            </h2>
            <p>
              You may terminate your account at any time by contacting us or
              using the account settings within the platform. We may terminate
              or suspend your access to the Service at any time for breach of
              these Terms, with notice where reasonably practicable.
            </p>
            <p className="mt-4">
              Upon termination, your right to use the Service ceases
              immediately. We will retain your data for a reasonable period to
              allow you to retrieve it, after which it may be deleted in
              accordance with our Privacy Policy and any applicable legal
              retention requirements.
            </p>
          </section>

          {/* Governing Law */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              10. Governing Law
            </h2>
            <p>
              These Terms are governed by and construed in accordance with the
              laws of New South Wales, Australia. You submit to the
              non-exclusive jurisdiction of the courts of New South Wales and
              any courts of appeal therefrom.
            </p>
          </section>

          {/* Dispute Resolution */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              11. Dispute Resolution
            </h2>
            <p>
              If a dispute arises in connection with these Terms, the parties
              agree to first attempt to resolve the dispute through good-faith
              negotiation. If the dispute is not resolved within thirty (30)
              days, either party may pursue resolution through the courts of New
              South Wales.
            </p>
          </section>

          {/* Changes to Terms */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              12. Changes to Terms
            </h2>
            <p>
              We may update these Terms from time to time. We will notify you of
              material changes by posting the updated Terms on the platform and,
              where appropriate, by email. Your continued use of the Service
              after the effective date of any changes constitutes your
              acceptance of the revised Terms.
            </p>
            <p className="mt-4">
              If you do not agree with the updated Terms, you should discontinue
              your use of the Service and close your account.
            </p>
          </section>

          {/* Severability */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              13. Severability
            </h2>
            <p>
              If any provision of these Terms is found to be invalid or
              unenforceable, that provision will be severed from these Terms,
              and the remaining provisions will continue in full force and
              effect.
            </p>
          </section>

          {/* Contact */}
          <section>
            <h2 className="mb-4 text-2xl font-semibold text-[var(--foreground)]">
              14. Contact
            </h2>
            <p>
              If you have any questions about these Terms, please contact us:
            </p>
            <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-alt)] p-6">
              <p className="font-medium text-[var(--foreground)]">
                StrataVerze Pty Ltd
              </p>
              <p className="mt-1">ABN 25 680 401 450</p>
              <p className="mt-1">ACN 680 401 450</p>
              <p className="mt-1">
                Email:{" "}
                <a
                  href="mailto:legal@strataverze.com"
                  className="text-brand-teal hover:text-brand-teal-dark"
                >
                  legal@strataverze.com
                </a>
              </p>
            </div>
          </section>
        </div>
      </article>
    </main>
  );
}
