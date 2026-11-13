import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient, GROK_PROVIDERS, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Wordmark } from "@/components/logo";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  if (isPending) return <div className="grid min-h-screen place-items-center bg-bg"><div className="h-10 w-40 animate-pulse rounded-xl bg-line" /></div>;
  if (user) {
    return (
      <main className="grid min-h-screen place-items-center bg-bg px-4">
        <div className="w-full max-w-sm space-y-3 text-center">
          <p>Session déjà ouverte.</p>
          <Link to="/app" className="inline-flex h-11 items-center rounded-xl bg-accent px-4 font-semibold text-on-accent">Aller au bureau</Link>
        </div>
      </main>
    );
  }
  return (
    <main className="grid min-h-screen place-items-center bg-bg px-4">
      <form
        className="w-full max-w-sm space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const res = await authClient.signIn.email({ email, password, callbackURL: "/app" });
          if (res.error) setError(res.error.message ?? "Connexion refusée");
          else await navigate({ to: "/app" });
        }}
      >
        <Wordmark />
        <h1 className="text-2xl font-semibold">Connexion</h1>
        <input className="h-11 w-full rounded-xl border border-line bg-surface px-3" type="email" required placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="h-11 w-full rounded-xl border border-line bg-surface px-3" type="password" required minLength={8} placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <p className="text-sm text-down">{error}</p> : null}
        <button type="submit" className="h-11 w-full rounded-xl bg-accent font-semibold text-on-accent">Entrer</button>
        {GROK_PROVIDERS.map((p) => (
          <button key={p.providerId} type="button" className="h-11 w-full rounded-xl border border-line" onClick={() => signIn(p.providerId, { callbackURL: "/app" })}>
            Continuer avec {p.label}
          </button>
        ))}
        <p className="text-sm text-muted">
          <Link to="/signup" className="text-ink">Créer un compte</Link>
          {" · "}
          <Link to="/mot-de-passe">Mot de passe oublié</Link>
        </p>
      </form>
    </main>
  );
}
