"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { Suspense, useState, type FormEvent } from "react";

import { useAuth } from "@/components/auth-provider";
import { apiRequest, type CurrentUser } from "@/lib/api";

function AuthForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, loading, error: sessionError, setUser } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(
    search.get("mode") === "register" ? "register" : "login",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  if (loading) {
    return <div className="auth-loading"><LoaderCircle className="spin" /> Checking your account…</div>;
  }
  if (user) {
    return (
      <div className="auth-success">
        <span className="success-mark">✓</span>
        <span className="eyebrow">YOU&apos;RE SIGNED IN</span>
        <h1>Welcome back,<br /><em>{user.full_name.split(" ")[0]}.</em></h1>
        <p>Good things are waiting for you.</p>
        <button className="button button-dark" onClick={() => router.push("/admin")}>Continue <ArrowRight size={16} /></button>
      </div>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const current = mode === "login"
        ? await apiRequest<CurrentUser>("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          })
        : await apiRequest<CurrentUser>("/auth/register", {
            method: "POST",
            body: JSON.stringify({
              full_name: fullName,
              email,
              phone,
              password,
              accept_terms: acceptedTerms,
            }),
          });
      if (mode === "register") {
        setMode("login");
        setError("Your account is ready. Sign in to continue.");
        setPassword("");
        return;
      }
      setUser(current);
      router.push(current.permissions.includes("dashboard.view") ? "/admin" : "/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn't complete that request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <div className="auth-visual">
        <Link className="brand brand-on-dark" href="/"><span className="brand-mark">d</span><span>daybreak<span className="brand-light"> market</span></span></Link>
        <div className="auth-visual-copy">
          <span className="eyebrow eyebrow-light">A LITTLE GOOD GOES A LONG WAY</span>
          <h1>Make room<br />for <em>lovely.</em></h1>
          <p>Good things for your table, your people, and the everyday in between.</p>
        </div>
        <div className="auth-visual-seal"><span>FRESH<br />STARTS<br />HERE</span><b>✳</b></div>
        <span className="auth-visual-foot">YOUR NEIGHBORHOOD, A LITTLE BRIGHTER</span>
      </div>
      <section className="auth-panel">
        <Link className="back-link" href="/"><ArrowLeft size={15} /> Back to the shop</Link>
        <div className="auth-form-wrap">
          <span className="eyebrow">{mode === "login" ? "GOOD TO SEE YOU AGAIN" : "WELCOME TO THE NEIGHBORHOOD"}</span>
          <h2>{mode === "login" ? "Come on in." : "Let’s get to know you."}</h2>
          <p className="auth-subtitle">
            {mode === "login" ? "Sign in to pick up where you left off." : "Create an account for the good things ahead."}
          </p>
          {sessionError && <div className="form-message" role="status">{sessionError}</div>}
          <div className="auth-tabs" role="tablist" aria-label="Account action">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(null); }}>Sign in</button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(null); }}>Create account</button>
          </div>
          <form className="auth-form" onSubmit={submit}>
            {mode === "register" && (
              <>
                <label>Full name<input required minLength={2} maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="How should we call you?" /></label>
                <label>Phone number<input required minLength={6} maxLength={20} pattern="[0-9+\- ]+" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+855 12 345 678" /></label>
              </>
            )}
            <label>Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
            <label>Password<input required type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" /></label>
            {mode === "register" && (
              <label className="terms-check"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} required /><span>I agree to the terms and understand this shop is preparing to open.</span></label>
            )}
            {error && <div className={`form-message ${error.startsWith("Your account") ? "form-success" : ""}`} role="status">{error}</div>}
            <button className="button button-dark auth-submit" type="submit" disabled={busy}>
              {busy ? <><LoaderCircle className="spin" size={16} /> One moment…</> : <>{mode === "login" ? "Sign in" : "Create account"} <ArrowRight size={16} /></>}
            </button>
          </form>
          <div className="auth-safety"><LockKeyhole size={15} /><span>Your account is protected with secure, private sign-in.</span></div>
        </div>
        <span className="auth-bottom-note">GOOD THINGS, FRESH DAILY · DAYBREAK MARKET</span>
      </section>
    </div>
  );
}

export function AuthScreen() {
  return <Suspense fallback={<div className="auth-loading"><LoaderCircle className="spin" /> Loading…</div>}><AuthForm /></Suspense>;
}
