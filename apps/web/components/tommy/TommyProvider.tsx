"use client";
// P1 Naman: one Tommy conversation for the whole site, so it follows you from page to page.
import { createContext, useContext, useState, type ReactNode } from "react";

import { useTommy } from "@/app/chat/_lib/useTommy";

type TommyContext = ReturnType<typeof useTommy> & { open: boolean; setOpen: (open: boolean) => void };

const Ctx = createContext<TommyContext | null>(null);

export function TommyProvider({ children }: { children: ReactNode }) {
  const chat = useTommy();
  const [open, setOpen] = useState(false);
  return <Ctx.Provider value={{ ...chat, open, setOpen }}>{children}</Ctx.Provider>;
}

export function useTommyChat(): TommyContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTommyChat needs <TommyProvider> (app/layout.tsx)");
  return ctx;
}
