import type { Metadata, Viewport } from "next";
import { inter, poppins } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "StrataVerze",
  description: "Owner-first strata management platform for Australian Owners Corporations",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#1A2028",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-AU"
      className={`${poppins.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
