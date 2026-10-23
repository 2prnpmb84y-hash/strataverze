import type { Metadata } from "next";
import localFont from "next/font/local";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import "./globals.css";

const poppins = localFont({
  variable: "--font-poppins",
  display: "swap",
  src: [
    { path: "../fonts/poppins-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/poppins-latin-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/poppins-latin-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/poppins-latin-700.woff2", weight: "700", style: "normal" },
  ],
});

const inter = localFont({
  variable: "--font-inter",
  display: "swap",
  src: [
    { path: "../fonts/inter-latin-variable.woff2", weight: "100 900", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: {
    default: "StrataVerze — Owner-first strata management",
    template: "%s | StrataVerze",
  },
  description:
    "Transparent finances, secure records, and real control for NSW Owners Corporations. StrataVerze puts owners back in charge of their strata scheme.",
  keywords: [
    "strata management",
    "owners corporation",
    "NSW strata",
    "strata finances",
    "strata records",
    "levy management",
    "strata compliance",
  ],
  authors: [{ name: "StrataVerze Pty Ltd" }],
  openGraph: {
    type: "website",
    locale: "en_AU",
    siteName: "StrataVerze",
    title: "StrataVerze — Owner-first strata management",
    description:
      "Transparent finances, secure records, and real control for NSW Owners Corporations.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
