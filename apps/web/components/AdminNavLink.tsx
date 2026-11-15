"use client";
// "Admin" in the top bar, shown only to signed-in department / USG admins (P4 shell).
// Hiding the link is only for tidiness: the AI service checks the role on every admin request.
// Without Supabase (pure mock development) the link always shows, so the mock admin page is reachable.
import Link from "next/link";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

const ADMIN_ROLES = new Set(["dept_admin", "usg_admin"]); // same as services/ai/app/core/auth.py

async function isAdmin(userId: string | undefined): Promise<boolean> {
  if (!supabase || !userId) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return ADMIN_ROLES.has(data?.role ?? "");
}

export function AdminNavLink() {
  const [show, setShow] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    let current = true;
    const check = (userId: string | undefined) =>
      isAdmin(userId)
        .catch(() => false)
        .then((admin) => current && setShow(admin));
    supabase.auth.getSession().then(({ data }) => check(data.session?.user.id));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void check(session?.user.id);
    });
    return () => {
      current = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (!show) return null;
  return (
    <Link href="/admin" className="nav-link">
      Admin
    </Link>
  );
}
