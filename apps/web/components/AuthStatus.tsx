"use client";
// Top-bar sign-in state + a banner for sign-in links that failed (P4 shell).
//
// Email links can arrive already used: university mail scanners open links to check them,
// which spends the one-time token, and the student's own click then lands here with
// #error_code=otp_expired. We show what happened and point to the 6-digit code instead.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { supabase } from "@/lib/supabase";

function readLinkError(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const code = params.get("error_code") || params.get("error");
  if (!code) return null;
  return code === "otp_expired"
    ? "That sign-in link expired or was already used (USC's email scanner may have opened it first). Sign in with the 6-digit code from the email instead."
    : `Sign-in didn't work: ${params.get("error_description") || code}. Please try again.`;
}

// Read the URL once per page load (the hash is removed right after), so every render agrees.
let linkErrorOnLoad: string | null | undefined;
const getLinkError = () => (linkErrorOnLoad ??= readLinkError());
const noSubscribe = () => () => {};

export function AuthStatus() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [dismissed, setDismissed] = useState(false);
  const linkError = useSyncExternalStore(noSubscribe, getLinkError, () => null);

  useEffect(() => {
    if (window.location.hash.includes("error")) {
      history.replaceState(null, "", window.location.pathname + window.location.search); // drop the #error=… from the URL
    }
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setEmail(session?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase?.auth.signOut();
    router.push("/login");
  }

  return (
    <>
      <div className="ml-auto flex items-center gap-3 text-sm">
        {!ready ? null : email ? (
          <>
            <span className="hidden max-w-48 truncate sm:inline" title={email}>
              {email}
            </span>
            <button onClick={signOut} className="rounded-md border border-white/60 px-3 py-1.5 font-semibold hover:bg-white/10">
              Sign out
            </button>
          </>
        ) : (
          <Link href="/login" className="rounded-md bg-gold px-3 py-1.5 font-semibold text-ink">
            {supabase ? "Sign in" : "Demo mode"}
          </Link>
        )}
      </div>
      {linkError && !dismissed && (
        <div role="alert" className="basis-full rounded-md bg-white px-3 py-2 text-sm text-ink">
          {linkError}{" "}
          <Link href="/login" className="font-semibold text-cardinal underline" onClick={() => setDismissed(true)}>
            Sign in with a code
          </Link>
        </div>
      )}
    </>
  );
}
