import { createFileRoute, Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/logo";

export const Route = createFileRoute("/mise-en-service")({ component: SetupPage });

function SetupPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Wordmark />
      <h1 className="text-3xl font-semibold tracking-tight">Mise en service</h1>
      <p className="text-sm text-muted">
        Aucun secret n’est dans le code. Aucun compte Stripe, Supabase ou GitHub n’a été créé. Votre premier site n’est pas référencé.
      </p>
      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">Ce qui fonctionne ici</h2>
        <p>Comptes (e-mail, Google, X), rôle propriétaire du premier compte, cinq agents, prix DexScreener, portefeuille simulé de 10 000 USD, arrêt d’urgence, offres éditables, webhook Stripe inerte tant que la clé manque.</p>
      </section>
      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">Ce qui reste à votre charge</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>Base Postgres de production, injectée par l’hébergeur. Ne réutilisez pas la base du premier site.</li>
          <li>Compte Stripe neuf. Produits préfixés GROKBOT_. Collez uniquement ces Price IDs. Variable serveur STRIPE_SECRET_KEY et STRIPE_WEBHOOK_SECRET, endpoint /api/stripe/webhook. Métadonnée obligatoire project=grok_bot.</li>
          <li>Clé API xAI côté serveur uniquement. Ce n’est pas votre abonnement Grok grand public. Chaque appel est payant.</li>
          <li>Worker toujours allumé, hors de cette interface, si le moteur doit tourner navigateur fermé. Ici il ne tourne que lorsqu’un bureau est ouvert.</li>
          <li>Avis juridique avant toute exécution réelle, signal payant ou gestion de portefeuille en France et dans l’Union européenne.</li>
        </ul>
      </section>
      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">Dépôts étudiés, non copiés</h2>
        <p className="text-muted">TradingAgents (Tauric Research) existe, licence Apache-2.0, cadre de recherche actions, pas un bot Solana. solana-agent-kit existe, Apache-2.0, non intégré pour éviter d’embarquer une surface de signatures trop large. Le dépôt Jackhuang166/ai-memecoin-trading-bot ne répond pas (404) : aucun code n’en vient.</p>
      </section>
      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">Logos</h2>
        <p className="text-muted">Les fichiers de logo société et d’application n’étaient pas joints. Le monogramme affiché est un repère provisoire, pas votre logo officiel.</p>
      </section>
      <Link to="/" className="inline-flex h-11 items-center text-sm font-semibold text-up">Retour</Link>
    </main>
  );
}
