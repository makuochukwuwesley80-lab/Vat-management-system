"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LoginHeader } from "./layout";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <div className="card glass-strong p-8">
      <LoginHeader />
      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="input-base"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            className="input-base"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error ? (
          <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-xs text-muted">
          Accounts are created by the media team or system manager.{" "}
          <Link href="/dashboard" className="underline">Go back</Link>
        </p>
      </form>
    </div>
  );
}
