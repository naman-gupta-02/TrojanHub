"use client";
// P4 Jaymin: sign in with a 6-digit code emailed to an @usc.edu address.
// (The Supabase email template must include {{ .Token }}.)
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [signedInAs, setSignedInAs] = useState<string | null>(null);

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setSignedInAs(data.session?.user.email ?? null));
  }, []);

  if (!supabase) {
    return (
      <section className="max-w-md space-y-3">
        <h1 className="text-2xl font-bold">Mock mode</h1>
        <p className="text-muted">
          Supabase isn&apos;t configured yet, so you&apos;re browsing as the demo user. Set NEXT_PUBLIC_SUPABASE_URL and
          NEXT_PUBLIC_SUPABASE_ANON_KEY in apps/web/.env.local to turn on login.
        </p>
      </section>
    );
  }
  const client = supabase;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const clean = email.trim().toLowerCase();
    if (step === "email") {
      if (!clean.endsWith("@usc.edu")) return setMessage("TrojanHub is for Trojans: use your @usc.edu email.");
      setBusy(true);
      const { error } = await client.auth.signInWithOtp({ email: clean, options: { shouldCreateUser: true } });
      setBusy(false);
      if (error) return setMessage(error.message);
      setStep("code");
      setMessage(`We emailed a 6-digit code to ${clean}.`);
    } else {
      setBusy(true);
      const { error } = await client.auth.verifyOtp({ email: clean, token: code.trim(), type: "email" });
      setBusy(false);
      if (error) return setMessage(error.message);
      router.push("/");
    }
  }

  if (signedInAs) {
    return (
      <section className="max-w-md space-y-3">
        <h1 className="text-2xl font-bold">Signed in</h1>
        <p className="text-muted">{signedInAs}</p>
        <button
          className="min-h-11 rounded-md bg-cardinal px-4 font-semibold text-white"
          onClick={async () => {
            await client.auth.signOut();
            setSignedInAs(null);
          }}
        >
          Sign out
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-3">
      <h1 className="text-2xl font-bold">Sign in to TrojanHub</h1>
      {step === "email" ? (
        <input
          type="email"
          required
          placeholder="ttrojan@usc.edu"
          aria-label="USC email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-11 w-full rounded-md border border-line bg-surface px-3"
        />
      ) : (
        <input
          inputMode="numeric"
          maxLength={6}
          required
          placeholder="6-digit code"
          aria-label="Code from email"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="min-h-11 w-full rounded-md border border-line bg-surface px-3"
        />
      )}
      <button disabled={busy} className="min-h-11 w-full rounded-md bg-cardinal font-semibold text-white hover:bg-cardinal-dark disabled:opacity-60">
        {busy ? "…" : step === "email" ? "Email me a code" : "Sign in"}
      </button>
      {message && <p className="text-sm text-muted">{message}</p>}
    </form>
  );
}
