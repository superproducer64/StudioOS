"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
const Context = createContext<{ user: User | null }>({ user: null });
export const useAuth = () => useContext(Context);
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    try {
      const client = getSupabase();
      void client.auth
        .getUser()
        .then(({ data, error }) => {
          if (active) {
            setUser(data.user);
            setReady(true);
            if (error && error.name !== "AuthSessionMissingError")
              setError(error.message);
          }
        })
        .catch((e) => {
          if (active) {
            setError((e as Error).message);
            setReady(true);
          }
        });
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (active) {
          setUser(session?.user || null);
          setReady(true);
          setError("");
        }
      });
      return () => {
        active = false;
        data.subscription.unsubscribe();
      };
    } catch (e) {
      setError((e as Error).message);
      setReady(true);
    }
    return () => {
      active = false;
    };
  }, []);
  if (pathname === "/login")
    return <Context.Provider value={{ user }}>{children}</Context.Provider>;
  if (!ready) return <section>Checking your session…</section>;
  if (!user)
    return (
      <section>
        <h1>Welcome to StudioOS</h1>
        <p>Sign in to open your private finance workspace.</p>
        {error && <p className="error">{error}</p>}
        <Link href="/login">Sign in or create your account</Link>
      </section>
    );
  return (
    <Context.Provider value={{ user }} key={user.id}>
      {children}
    </Context.Provider>
  );
}
