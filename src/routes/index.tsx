import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { Wordmark } from "@/components/logo";
import { listPlans } from "@/lib/grok/fns";
import { eur } from "@/lib/grok/format";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({ meta: [{ title: "Grok Bot" }] }),
});

function Landing() {
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof listPlans>>>([]);
  useEffect(() => { listPlans().then(setPlans).catch(() => setPlans([])); }, []);
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Wordmark />
        <nav className="flex items-center gap-4 text-sm">
          <a href="#offres" className="text-muted">Offres</a>
          <Link to="/legal/risques" className="text-muted">Risques</Link>
          <SignedOut>
            <Link to="/login" className="h-11 rounded-xl bg-accent px-4 leading-[2.75rem] font-semibold text-on-accent">Connexion</Link>
          </SignedOut>
          <SignedIn>
            <Link to="/app" className="h-11 rounded-xl bg-accent px-4 leading-[2.75rem] font-semibold text-on-accent">Ouvrir le bureau</Link>
          </SignedIn>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-20">
        <p className="mt-12 text-sm font-semibold text-up">Solana · simulation par défaut</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Cinq agents. Un moteur. Aucune phrase de récupération.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Grok Bot suit des prix Solana réels, filtre la liquidité, taille le risque et n’écrit que des opérations simulées tant que vous n’armez pas une délégation — ce qui n’est pas le cas ici.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <SignedIn>
            <Link to="/app" className="h-12 rounded-xl bg-accent px-5 leading-[3rem] font-semibold text-on-accent">Entrer dans le tableau</Link>
          </SignedIn>
          <SignedOut>
            <Link to="/signup" className="h-12 rounded-xl bg-accent px-5 leading-[3rem] font-semibold text-on-accent">Créer un compte</Link>
          </SignedOut>
          <Link to="/mise-en-service" className="h-12 rounded-xl border border-line px-5 leading-[3rem]">Mise en service</Link>
        </div>
        <dl className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {[
            ["Exécution on-chain", "Non armée"],
            ["Source des prix", "DexScreener"],
            ["Capital affiché", "10 000 USD simulés"],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-5 py-4">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-1 font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <section className="mt-16 grid gap-4 md:grid-cols-5">
          {[
            ["Scanner", "Lit les paires et les volumes."],
            ["Safety", "Bloque la liquidité trop fine."],
            ["Analyst", "Score la variation observée."],
            ["Risk", "Plafonne taille et perte."],
            ["Executor", "Simule, ou attend votre validation."],
          ].map(([t, d], i) => (
            <article key={t} className="rounded-2xl border border-line bg-surface p-4">
              <p className="num text-xs text-muted">0{i + 1}</p>
              <h2 className="mt-2 font-semibold">{t}</h2>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </article>
          ))}
        </section>
        <section id="offres" className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Offres</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">Les tarifs à 0 € ne sont pas publiés. L’administration les fixe. Le propriétaire n’est jamais facturé pour le logiciel.</p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {plans.map((p) => (
              <article key={p.id} className="rounded-2xl border border-line bg-surface p-5">
                <p className="text-xs text-muted">{p.code}</p>
                <h3 className="mt-1 text-xl font-semibold">{p.name}</h3>
                <p className="mt-2 text-sm text-muted">{p.description}</p>
                <p className="num mt-4 text-lg">{p.priceCents === 0 ? "Tarif à définir" : eur(p.priceCents)}</p>
              </article>
            ))}
          </div>
        </section>
        <footer className="mt-16 flex flex-wrap gap-4 border-t border-line pt-6 text-sm text-muted">
          <Link to="/legal/conditions">Conditions</Link>
          <Link to="/legal/confidentialite">Confidentialité</Link>
          <Link to="/legal/risques">Risques</Link>
          <Link to="/legal/mentions">Mentions</Link>
        </footer>
      </main>
    </div>
  );
}
