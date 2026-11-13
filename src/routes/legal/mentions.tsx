import { createFileRoute } from "@tanstack/react-router";
import { Legal } from "@/components/legal";

export const Route = createFileRoute("/legal/mentions")({
  component: () => (
    <Legal title="Mentions">
      <p>Grok Bot est une activité logicielle distincte. Elle n’utilise pas les produits, Price IDs, webhooks, clients ou base du premier site.</p>
      <p>Les noms Phantom, Solflare, Jupiter, DexScreener, Stripe et xAI désignent leurs services. Aucun partenariat n’est revendiqué. Une intégration est indiquée comme active seulement si le code l’appelle vraiment.</p>
      <p>Éditeur, siège, SIREN et hébergeur de production sont à compléter avant mise en ligne commerciale.</p>
    </Legal>
  ),
});
