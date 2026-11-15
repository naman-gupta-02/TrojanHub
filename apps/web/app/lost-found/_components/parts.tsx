// P2 Vishwa: small shared pieces for the Lost & Found pages.
import type { Building, DropoffInfo, Item, ItemTier } from "@trojanhub/shared";
import Link from "next/link";

import { matchLabel, timeAgo, whereFound } from "../_lib/data";

export function TierBadge({ tier }: { tier: ItemTier }) {
  return tier === "valuable" ? (
    <span className="inline-block rounded-full bg-cardinal px-2.5 py-0.5 text-xs font-semibold text-white">Valuable · at DPS</span>
  ) : (
    <span className="inline-block rounded-full bg-[#3b5b7a] px-2.5 py-0.5 text-xs font-semibold text-white">Everyday</span>
  );
}

export function ItemPhoto({ item, className = "" }: { item: Pick<Item, "photo_url" | "title">; className?: string }) {
  if (item.photo_url) {
    // Supabase Storage URLs; a plain <img> avoids configuring remote hosts for next/image.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.photo_url} alt={item.title} className={`bg-line/60 object-cover ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-line/60 text-muted ${className}`} aria-label="No photo">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M8 5l1.5-2h5L16 5" />
      </svg>
    </div>
  );
}

export function ItemCard({ item, buildings, score }: { item: Item; buildings: Record<string, Building>; score?: number }) {
  return (
    <Link
      href={`/lost-found/${item.id}`}
      className="group flex w-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-cardinal"
    >
      <ItemPhoto item={item} className="aspect-square w-full" />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <TierBadge tier={item.tier} />
          {score !== undefined && <span className="text-xs font-semibold text-success">{matchLabel(score)}</span>}
        </div>
        <h3 className="font-semibold leading-snug group-hover:underline">{item.title}</h3>
        <p className="text-sm text-muted">{whereFound(item, buildings)}</p>
        <p className="mt-auto text-xs text-muted">Found {timeAgo(item.created_at)}</p>
      </div>
    </Link>
  );
}

export function DropoffCard({ dropoff, title, children }: { dropoff: DropoffInfo; title: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border-2 border-cardinal bg-surface p-4">
      <p className="font-semibold text-cardinal">{title}</p>
      {children}
      <p className="font-medium">{dropoff.name}</p>
      {dropoff.hours && <p className="text-sm text-muted">Hours: {dropoff.hours}</p>}
      <div className="flex flex-wrap gap-2 pt-1">
        <a href={dropoff.map} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-md bg-cardinal px-4 font-semibold text-white hover:bg-cardinal-dark">
          Open in Maps
        </a>
        {dropoff.url && (
          <a href={dropoff.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-md border border-line px-4 font-semibold hover:bg-background">
            DPS Lost &amp; Found page
          </a>
        )}
      </div>
    </div>
  );
}

export function SignInNotice({ what }: { what: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p>
        Sign in with your USC email to {what}.{" "}
        <Link href="/login" className="font-semibold text-cardinal underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
      {message}
    </p>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center text-sm font-semibold text-cardinal hover:underline">
      ← {label}
    </Link>
  );
}
