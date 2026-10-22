import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contractors | StrataVerze",
  description:
    "Join StrataVerze as a contractor. Get discovered by strata managers, manage compliance documents and streamline your work in the strata sector.",
};

const FEATURES = [
  {
    title: "Business Profile Listing",
    description:
      "Showcase your trade qualifications, service areas and project experience to strata managers across the platform.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Zm6-10.125a1.875 1.875 0 1 1-3.75 0 1.875 1.875 0 0 1 3.75 0Zm1.294 6.336a6.721 6.721 0 0 1-3.17.789 6.721 6.721 0 0 1-3.168-.789 3.376 3.376 0 0 1 6.338 0Z" />
      </svg>
    ),
  },
  {
    title: "Compliance Management",
    description:
      "Upload and track licences, insurance certificates and registrations in one place. Receive expiry reminders before documents lapse.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
  {
    title: "RFQ Invitations",
    description:
      "Receive relevant requests for quotation based on your trade categories, specialist services and service regions.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
      </svg>
    ),
  },
  {
    title: "Work Order Management",
    description:
      "Submit quotations, manage awarded contracts, handle variations and completion submissions all through one platform.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0 1 18 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3 1.5 1.5 3-3.75" />
      </svg>
    ),
  },
  {
    title: "Invoicing & Payments",
    description:
      "Submit invoices directly through the platform and track payment status with full visibility from submission to settlement.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
      </svg>
    ),
  },
  {
    title: "Multiple Authorised Users",
    description:
      "Add team members to your business account so colleagues can manage compliance documents and respond to work opportunities.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
];

const INCLUSIONS = [
  "Business profile listing",
  "Multiple authorised business users",
  "Trade and location preferences",
  "Relevant RFQ invitations where available",
  "Quotation submission",
  "Compliance document management",
  "Expiry reminders",
  "Awarded work administration",
  "Variations",
  "Completion submissions",
  "Invoice submission",
  "Payment status visibility",
];

const FAQ = [
  {
    q: "Do I need a credit card to sign up?",
    a: "No. The promotional period is entirely free with no payment details required.",
  },
  {
    q: "What happens when the promotional period ends?",
    a: "Nothing automatic. You will need to explicitly activate a paid subscription if you wish to continue. There is no automatic charge.",
  },
  {
    q: "Does paying improve my compliance status or guarantee work?",
    a: "No. Payment does not improve compliance status, guarantee selection, override scheme procurement decisions or automatically improve contractor rankings.",
  },
  {
    q: "What documents do I need to register?",
    a: "You will need your ABN, relevant trade licences, insurance certificates of currency and banking details for payment. The onboarding wizard guides you through each step.",
  },
  {
    q: "Can I add multiple team members?",
    a: "Yes. Your membership includes multiple authorised business users who can manage compliance and respond to opportunities on behalf of the business.",
  },
  {
    q: "Are there any per-lead fees or commissions?",
    a: "No. Under the StrataVerze Contractor plan there are no additional per-lead fees and no platform commission on awarded work.",
  },
];

export default function ContractorLandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="text-center mb-16">
        <div className="inline-flex items-center rounded-full bg-[#FF6B54]/10 px-3 py-1 text-xs font-medium text-[#FF6B54] mb-4">
          Now accepting registrations
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold font-heading text-[#0A0F1C] leading-tight mb-4">
          Grow your strata
          <br />
          contracting business
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
          Join StrataVerze to connect with strata managers, manage your compliance
          documents and streamline work from quotation to payment.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/register?role=supplier"
            className="rounded-[var(--radius-card)] bg-[#FF6B54] px-6 py-3 text-base font-semibold text-white hover:bg-[#e55d48] transition-colors"
          >
            Register Free
          </Link>
          <Link
            href="/login"
            className="rounded-[var(--radius-card)] border border-gray-300 px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* Features grid */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold font-heading text-[#0A0F1C] text-center mb-8">
          Everything you need to manage strata work
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feat) => (
            <div
              key={feat.title}
              className="rounded-[var(--radius-card)] border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-[#FF6B54]/10 text-[#FF6B54] mb-3">
                {feat.icon}
              </div>
              <h3 className="text-base font-semibold text-[#0A0F1C] mb-1">
                {feat.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {feat.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="mb-16" id="pricing">
        <h2 className="text-2xl font-bold font-heading text-[#0A0F1C] text-center mb-2">
          Simple, transparent pricing
        </h2>
        <p className="text-center text-gray-600 mb-8">
          One plan. No hidden fees. No commissions.
        </p>

        <div className="max-w-lg mx-auto rounded-2xl border-2 border-[#FF6B54] overflow-hidden">
          {/* Promotional banner */}
          <div className="bg-[#FF6B54] px-6 py-3 text-center">
            <p className="text-sm font-semibold text-white">
              FREE through 31 March 2027
            </p>
          </div>

          <div className="bg-white p-6">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-[#0A0F1C]">
                  StrataVerze Contractor
                </h3>
                <p className="text-sm text-gray-500">Monthly membership plan</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-[#0A0F1C]">$0</p>
                <p className="text-xs text-gray-500">currently payable</p>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 mb-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-gray-500">Future price</span>
                <span className="text-right font-medium text-[#0A0F1C]">
                  $8.00/month (incl. GST)
                </span>
                <span className="text-gray-500">Paid availability</span>
                <span className="text-right font-medium text-[#0A0F1C]">
                  From 1 April 2027
                </span>
                <span className="text-gray-500">Billing</span>
                <span className="text-right font-medium text-[#0A0F1C]">
                  Month-to-month (no minimum)
                </span>
                <span className="text-gray-500">Compliance verification</span>
                <span className="text-right font-medium text-[#0A0F1C]">
                  $53.90/year (incl. GST)
                </span>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 mb-6">
              <h4 className="text-sm font-semibold text-[#0A0F1C] mb-3">
                Includes
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {INCLUSIONS.map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-[#FF6B54] shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span className="text-sm text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Promotional terms */}
            <div className="rounded-[var(--radius-card)] bg-gray-50 border border-gray-200 p-4 mb-6">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Promotional terms
              </h4>
              <ul className="space-y-1.5 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <span className="text-[#FF6B54] mt-0.5">✓</span> No credit card required
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#FF6B54] mt-0.5">✓</span> No automatic charge when promotion ends
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#FF6B54] mt-0.5">✓</span> Explicit paid subscription activation required
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#FF6B54] mt-0.5">✓</span> No per-lead fees under this plan
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#FF6B54] mt-0.5">✓</span> No platform commission on awarded work
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#FF6B54] mt-0.5">✓</span> No guarantee of leads, work or contract awards
                </li>
              </ul>
            </div>

            <Link
              href="/register?role=supplier"
              className="block w-full text-center rounded-[var(--radius-card)] bg-[#FF6B54] px-6 py-3 text-base font-semibold text-white hover:bg-[#e55d48] transition-colors"
            >
              Get Started Free
            </Link>
          </div>
        </div>

        {/* Important notice */}
        <div className="max-w-lg mx-auto mt-4 rounded-[var(--radius-card)] bg-blue-50 border border-blue-200 px-4 py-3">
          <p className="text-xs text-blue-700 text-center leading-relaxed">
            Payment does not improve compliance status, guarantee selection, override
            scheme procurement decisions or automatically improve contractor rankings.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold font-heading text-[#0A0F1C] text-center mb-8">
          How it works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
          {[
            {
              step: "1",
              title: "Register",
              desc: "Create your account and verify your ABN through the Australian Business Register.",
            },
            {
              step: "2",
              title: "Complete Profile",
              desc: "Add your business details, trade categories, service areas and upload compliance documents.",
            },
            {
              step: "3",
              title: "Get Verified",
              desc: "Our team reviews your documents and licences. You will be notified once verification is complete.",
            },
            {
              step: "4",
              title: "Start Working",
              desc: "Receive RFQ invitations, submit quotations and manage your strata contracts through the platform.",
            },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-[#FF6B54] text-white text-lg font-bold mx-auto mb-3">
                {item.step}
              </div>
              <h3 className="text-base font-semibold text-[#0A0F1C] mb-1">
                {item.title}
              </h3>
              <p className="text-sm text-gray-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold font-heading text-[#0A0F1C] text-center mb-8">
          Frequently asked questions
        </h2>
        <div className="max-w-2xl mx-auto space-y-4">
          {FAQ.map((item) => (
            <div
              key={item.q}
              className="rounded-[var(--radius-card)] border border-gray-200 p-4"
            >
              <h3 className="text-sm font-semibold text-[#0A0F1C] mb-1">
                {item.q}
              </h3>
              <p className="text-sm text-gray-600">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center rounded-2xl bg-[#0A0F1C] px-8 py-12 mb-8">
        <h2 className="text-2xl font-bold font-heading text-white mb-3">
          Ready to grow your strata business?
        </h2>
        <p className="text-gray-400 mb-6">
          Register now and start your free promotional period. No credit card required.
        </p>
        <Link
          href="/register?role=supplier"
          className="inline-flex rounded-[var(--radius-card)] bg-[#FF6B54] px-8 py-3 text-base font-semibold text-white hover:bg-[#e55d48] transition-colors"
        >
          Register Free
        </Link>
      </section>
    </div>
  );
}
