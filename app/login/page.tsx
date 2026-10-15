"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // True after the user opens the reset link from their email: Supabase signs them in briefly
  // so they can choose a new password.
  const [recovering, setRecovering] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (!active) return;
        setSignedIn(session?.user.email || null);
        if (event === "PASSWORD_RECOVERY") setRecovering(true);
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
  async function sendReset() {
    setBusy(true);
    setNotice("");
    try {
      const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + "/login",
      });
      if (error) throw error;
      // The same message whether or not the email has an account, so this cannot be used to
      // find out who has one.
      setNotice("If that email has an account, a password reset link is on its way.");
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function chooseNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) return setNotice("Use at least 8 characters.");
    if (newPassword !== confirmPassword) return setNotice("The two passwords do not match.");
    setBusy(true);
    setNotice("");
    try {
      const { error } = await getSupabase().auth.updateUser({ password: newPassword });
      if (error) throw error;
      setRecovering(false);
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Password changed. You are signed in.");
    } catch (err) {
      setNotice((err as Error).message);
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
        {recovering ? (
          <form onSubmit={chooseNewPassword}>
            <p>Choose a new password for {signedIn ?? "your account"}.</p>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            <button disabled={busy} type="submit">
              Change password
            </button>
          </form>
        ) : signedIn ? (
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
            <button disabled={busy || !email.trim()} type="button" onClick={() => void sendReset()}>
              Forgot password?
            </button>
          </form>
        )}
        {notice && <p role="status">{notice}</p>}
        <small>
          For email confirmation and password reset, add your local or deployed
          app address (for example http://localhost:3000/login) under Supabase
          Authentication, URL Configuration, Redirect URLs.
        </small>
      </section>
    </>
  );
}
