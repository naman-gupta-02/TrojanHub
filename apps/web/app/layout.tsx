// Site shell + nav (P4 Jaymin). Each page belongs to its feature owner.
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TrojanHub",
  description: "Everything Trojans need, one ask away.",
};

const NAV = [
  { href: "/", label: "Home" },
  { href: "/chat", label: "Tommy" },
  { href: "/lost-found", label: "Lost & Found" },
  { href: "/events", label: "Events" },
  { href: "/deals", label: "Deals" },
  { href: "/rewards", label: "Rewards" },
  { href: "/report", label: "Report" },
  { href: "/admin", label: "Admin" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="bg-cardinal text-white">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3" aria-label="Main">
            <Link href="/" className="mr-2 text-lg font-bold">
              Trojan<span className="text-gold">Hub</span>
            </Link>
            {NAV.slice(1).map((n) => (
              <Link key={n.href} href={n.href} className="text-sm hover:underline">
                {n.label}
              </Link>
            ))}
            <Link href="/login" className="ml-auto rounded-md bg-gold px-3 py-1.5 text-sm font-semibold text-ink">
              Sign in
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
