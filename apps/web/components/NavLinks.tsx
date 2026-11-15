"use client";
// Top-bar links with a gold underline on the current page (P4 shell).
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string }[] }) {
  const path = usePathname() ?? "/";
  return (
    <>
      {links.map((n) => {
        const active = path === n.href || path.startsWith(`${n.href}/`);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined} className={`nav-link ${active ? "is-active" : ""}`}>
            {n.label}
          </Link>
        );
      })}
    </>
  );
}
