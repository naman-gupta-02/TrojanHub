// Site shell + nav (P4 Jaymin). Each page belongs to its feature owner.
// Tommy (P1) is not a nav tab: he's the floating "Chat with Tommy" button on every page.
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";

import { AdminNavLink } from "@/components/AdminNavLink";
import { AuthStatus } from "@/components/AuthStatus";
import { NavLinks } from "@/components/NavLinks";
import { TommyProvider } from "@/components/tommy/TommyProvider";
import { TommyWidget } from "@/components/tommy/TommyWidget";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TrojanHub",
  description: "Everything Trojans need, one ask away.",
  icons: { icon: "/tommy/default.svg" },
};

const NAV = [
  { href: "/lost-found", label: "Lost & Found" },
  { href: "/events", label: "Events" },
  { href: "/deals", label: "Deals" },
  { href: "/rewards", label: "Rewards" },
  { href: "/report", label: "Report" },
]; // "Admin" is added by <AdminNavLink /> for admin accounts only

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <TommyProvider>
          <header className="site-header z-40 text-white sm:sticky sm:top-0">
            <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3" aria-label="Main">
              <Link href="/" className="wordmark mr-3 text-3xl font-black tracking-tight" aria-label="TrojanHub home">
                Trojan<span className="text-gold">Hub</span>
              </Link>
              {/* the current-page highlight reads the URL, so it streams in after the static links */}
              <Suspense
                fallback={NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="nav-link">
                    {n.label}
                  </Link>
                ))}
              >
                <NavLinks links={NAV} />
              </Suspense>
              <AdminNavLink />
              <AuthStatus />
            </nav>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-28">{children}</main>
          <Suspense fallback={null}>
            <TommyWidget />
          </Suspense>
        </TommyProvider>
      </body>
    </html>
  );
}
