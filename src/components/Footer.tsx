import Image from "next/image";
import Link from "next/link";

const footerLinks = {
  Product: [
    { name: "Features", href: "/features" },
    { name: "Pricing", href: "/pricing" },
    { name: "Suppliers", href: "/suppliers" },
  ],
  Company: [
    { name: "About", href: "/about" },
    { name: "Contact", href: "/contact" },
  ],
  Legal: [
    { name: "Privacy policy", href: "/privacy" },
    { name: "Terms of service", href: "/terms" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center">
              <Image
                src="https://www.strataverze.com/brand/logo-horizontal-gradient.png"
                alt="StrataVerze"
                width={220}
                height={48}
                className="h-12 w-auto"
              />
            </Link>
            <p className="mt-4 text-sm text-[var(--muted)] max-w-xs">
              Owner-first strata management for NSW Owners Corporations. Transparent finances, secure records, and real control.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading}>
              <h4 className="text-sm font-semibold text-[var(--foreground)] mb-4">{heading}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.name}>
                    <Link
                      href={link.href}
                      className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-[var(--border)] flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-[var(--muted)]">
            &copy; {new Date().getFullYear()} StrataVerze Pty Ltd. ABN 25 680 401 450. All rights reserved.
          </p>
          <p className="text-xs text-[var(--muted)]">
            Made in Sydney, Australia
          </p>
        </div>
      </div>
    </footer>
  );
}
