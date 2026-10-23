import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | StrataVerze",
  description:
    "Terms and conditions governing the use of the StrataVerze platform.",
};

export default function TermsOfServicePage() {
  return (
    <article className="prose prose-gray max-w-none">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">
        Terms of Service
      </h1>
      <p className="text-sm text-gray-500">Last updated: 17 October 2026</p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-gray-900">
          1. Acceptance of Terms
        </h2>
        <p>
          By accessing or using the StrataVerze platform
          (&ldquo;Platform&rdquo;), you agree to be bound by these Terms of
          Service (&ldquo;Terms&rdquo;). If you do not agree to these Terms, you
          must not use the Platform.
        </p>
        <p>
          StrataVerze is operated in Australia and is designed for use by
          Australian strata schemes, owners corporations, strata managers,
          committee members and suppliers.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          2. Definitions
        </h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong>&ldquo;Platform&rdquo;</strong> means the StrataVerze web
            application available at app.strataverze.com and any associated
            services.
          </li>
          <li>
            <strong>&ldquo;User&rdquo;</strong> means any individual who
            registers for or accesses the Platform, including lot owners,
            committee members, strata advisers and suppliers.
          </li>
          <li>
            <strong>&ldquo;Scheme&rdquo;</strong> means a strata scheme, owners
            corporation or body corporate managed through the Platform.
          </li>
          <li>
            <strong>&ldquo;Content&rdquo;</strong> means any data, documents,
            text, images or other materials uploaded to or generated within the
            Platform.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          3. Account Registration
        </h2>
        <p>
          To use the Platform, you must create an account with a valid email
          address. You are responsible for maintaining the confidentiality of
          your login credentials and for all activities that occur under your
          account.
        </p>
        <p>
          You agree to provide accurate, current and complete information during
          registration and to update your details promptly if they change.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          4. Permitted Use
        </h2>
        <p>You may use the Platform only for lawful purposes related to strata scheme management. You agree not to:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>Use the Platform for any purpose that violates applicable Australian law or regulation.</li>
          <li>Attempt to gain unauthorised access to other users&rsquo; accounts or scheme data.</li>
          <li>Upload malicious software, viruses or harmful code.</li>
          <li>Interfere with or disrupt the Platform&rsquo;s infrastructure or security measures.</li>
          <li>Scrape, harvest or collect data from the Platform through automated means without our prior written consent.</li>
          <li>Use the Platform to harass, defame or threaten other users.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          5. User Content
        </h2>
        <p>
          You retain ownership of any Content you upload to the Platform. By
          uploading Content, you grant StrataVerze a non-exclusive, worldwide
          licence to store, process and display that Content solely for the
          purpose of providing the Platform services to you and your scheme.
        </p>
        <p>
          You are responsible for ensuring that any Content you upload does not
          infringe the intellectual property rights of any third party and
          complies with applicable laws.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          6. Roles and Access
        </h2>
        <p>
          The Platform provides different access levels based on your role within
          a scheme:
        </p>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong>Owners</strong> can view their lot details, levy statements,
            documents and scheme information.
          </li>
          <li>
            <strong>Committee members</strong> have additional access to
            governance features, compliance tracking and member management.
          </li>
          <li>
            <strong>Advisers</strong> (strata managers) can manage all aspects
            of schemes assigned to them, including levies, documents, by-laws,
            insurance and work orders.
          </li>
          <li>
            <strong>Suppliers</strong> can view and respond to quote requests,
            manage work orders and submit invoices for schemes they are engaged
            with.
          </li>
        </ul>
        <p>
          Access to scheme data is controlled by the scheme&rsquo;s adviser or
          committee. StrataVerze is not responsible for the access decisions
          made by scheme administrators.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          7. Availability and Support
        </h2>
        <p>
          We aim to keep the Platform available at all times but do not guarantee
          uninterrupted access. We may suspend or restrict access for
          maintenance, updates or circumstances beyond our reasonable control.
        </p>
        <p>
          Support is available via email at{" "}
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
          8. Fees and Payment
        </h2>
        <p>
          Certain features of the Platform may require a paid subscription.
          Pricing and payment terms will be communicated to you before any
          charges apply. We reserve the right to modify our pricing with
          reasonable notice.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          9. Intellectual Property
        </h2>
        <p>
          The Platform, including its design, code, branding and documentation,
          is owned by StrataVerze and protected by Australian and international
          intellectual property laws. Nothing in these Terms grants you any
          rights to our intellectual property except the limited right to use
          the Platform as described herein.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          10. Limitation of Liability
        </h2>
        <p>
          To the maximum extent permitted by law, StrataVerze shall not be
          liable for any indirect, incidental, special, consequential or punitive
          damages arising from your use of the Platform, including but not
          limited to loss of data, loss of profits, or business interruption.
        </p>
        <p>
          The Platform is a management tool and does not constitute legal,
          financial or professional advice. You should seek independent
          professional advice for legal, financial or compliance matters
          relating to your strata scheme.
        </p>
        <p>
          Nothing in these Terms excludes or limits liability that cannot be
          excluded or limited under Australian Consumer Law.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          11. Indemnification
        </h2>
        <p>
          You agree to indemnify and hold harmless StrataVerze, its officers,
          employees and agents from and against any claims, damages, losses or
          expenses (including reasonable legal fees) arising from your breach of
          these Terms or your use of the Platform.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          12. Termination
        </h2>
        <p>
          You may close your account at any time by contacting us. We may
          suspend or terminate your access to the Platform if you breach these
          Terms or if we are required to do so by law.
        </p>
        <p>
          Upon termination, your right to access the Platform ceases. Scheme
          data may be retained as required by applicable strata legislation or
          as set out in our Privacy Policy.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          13. Changes to These Terms
        </h2>
        <p>
          We may update these Terms from time to time. Material changes will be
          communicated through the Platform or via email at least 30 days before
          they take effect. Your continued use of the Platform after the
          effective date constitutes acceptance of the updated Terms.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">
          14. Governing Law
        </h2>
        <p>
          These Terms are governed by the laws of New South Wales, Australia.
          Any disputes arising from these Terms shall be subject to the
          exclusive jurisdiction of the courts of New South Wales.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-gray-900">15. Contact Us</h2>
        <p>
          If you have questions about these Terms, please contact us:
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
      </section>
    </article>
  );
}
