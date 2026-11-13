import { createFileRoute } from "@tanstack/react-router";
import { Legal } from "@/components/legal";

export const Route = createFileRoute("/legal/risques")({
  component: () => (
    <Legal title="Avertissement sur les risques">
      <p>Les crypto-actifs peuvent perdre toute valeur. Un logiciel, même avec des agents, ne réduit pas ce risque à zéro.</p>
      <p>Les chiffres du bureau sont un paper trading. Un résultat simulé n’est pas un gain, ni une performance passée commercialisable.</p>
      <p>Le filtre Safety est une heuristique sur la liquidité DexScreener. Il ne détecte pas un honeypot, une taxe cachée ou un rug pull.</p>
      <p>En France et dans l’Union européenne, la vente d’un logiciel, la fourniture de signaux, le conseil en investissement, la réception-transmission d’ordres, l’exécution et la gestion de portefeuille ne suivent pas le même régime. Cette version ne fournit pas ces services réglementés. Ne les activez pas sans analyse juridique.</p>
    </Legal>
  ),
});
