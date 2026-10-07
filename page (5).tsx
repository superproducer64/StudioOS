"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      const supabase = getSupabase();
      let active = true;
      void supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (active) {
            setSignedIn(data.session?.user.email || null);
            if (error) setNotice(error.message);
          }
        })
        .catch((e) => {
          if (active) setNotice((e as Error).message);
        });
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (active) setSignedIn(session?.user.email || null);
      });
      return () => {
        active = false;
        data.subscription.unsubscribe();
      };
    } catch (e) {
      setNotice((e as Error).message);
    }
  }, []);
  async function authenticate(signup: boolean) {
    setBusy(true);
    setNotice("");
    try {
      const supabase = getSupabase();
      const result = signup
        ? await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: window.location.origin + "/login" },
          })
        : await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setNotice(
        signup && !result.data.session
          ? "Check your email for the confirmation link."
          : "Signed in. Open Dashboard to enter your workspace.",
      );
      setPassword("");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signout() {
    setBusy(true);
    try {
      const { error } = await getSupabase().auth.signOut();
      if (error) throw error;
      setNotice("Signed out of your private workspace.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>StudioOS account</h1>
      <p>
        Sign in to your private StudioOS finance workspace. Your accounts and
        transactions are stored in Supabase.
      </p>
      <section>
        {signedIn ? (
          <>
            <p>Signed in as {signedIn}</p>
            <button disabled={busy} onClick={() => void signout()}>
              Sign out
            </button>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void authenticate(false);
            }}
          >
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button disabled={busy} type="submit">
              Sign in
            </button>
            <button
              disabled={busy || !email || password.length < 8}
              type="button"
              onClick={() => void authenticate(true)}
            >
              Create account
            </button>
          </form>
        )}
        {notice && <p role="status">{notice}</p>}
        <small>
          For email confirmation, configure Supabase Auth Site URL to your local
          or deployed app URL before signup.
        </small>
      </section>
    </>
  );
}
