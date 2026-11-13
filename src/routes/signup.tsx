import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Wordmark } from "@/components/logo";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  if (isPending) return <div className="grid min-h-screen place-items-center bg-bg"><div className="h-10 w-40 animate-pulse rounded-xl bg-line" /></div>;
  if (user) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg px-4">
        <Link to="/app" className="inline-flex h-11 items-center rounded-xl bg-accent px-4 font-semibold text-on-accent">Continuer</Link>
      </main>
    );
  }
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4">
      <form
        className="w-full max-w-sm space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await authClient.signUp.email({ email, password, name, callbackURL: "/app" });
          if (res.error) setError(res.error.message ?? "Inscription refusée");
          else await navigate({ to: "/app" });
        }}
      >
        <Wordmark />
        <h1 className="text-2xl font-semibold">Inscription</h1>
        <input className="h-11 w-full rounded-xl border border-line bg-surface px-3" required placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="h-11 w-full rounded-xl border border-line bg-surface px-3" type="email" required placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="h-11 w-full rounded-xl border border-line bg-surface px-3" type="password" required minLength={8} placeholder="Mot de passe, 8 caractères" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <p className="text-sm text-down">{error}</p> : null}
        <button type="submit" className="h-11 w-full rounded-xl bg-accent font-semibold text-on-accent">Créer le compte</button>
        <Link to="/login" className="block text-sm text-muted">Déjà un compte</Link>
      </form>
    </main>
  );
}
