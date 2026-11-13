import { createFileRoute } from "@tanstack/react-router";
import { Legal } from "@/components/legal";

export const Route = createFileRoute("/legal/conditions")({
  component: () => (
    <Legal title="Conditions d’utilisation">
      <p>Grok Bot est un logiciel. L’accès aux fonctions payantes dépend d’une offre activée après paiement confirmé, sauf pour le compte propriétaire, exempté côté serveur.</p>
      <p>Les prix affichés à « tarif à définir » ne constituent pas une offre ferme. L’administration publie le prix avant encaissement.</p>
      <p>La simulation ne déplace aucun actif. Le mode assisté prépare un ordre papier. Le mode automatisé, dans cette version, ne dispose d’aucune délégation de clé et ne signe rien on-chain.</p>
      <p>Vous ne devez pas communiquer de phrase de récupération. Le service n’a pas à vous la demander.</p>
    </Legal>
  ),
});
