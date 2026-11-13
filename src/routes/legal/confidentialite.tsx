import { createFileRoute } from "@tanstack/react-router";
import { Legal } from "@/components/legal";

export const Route = createFileRoute("/legal/confidentialite")({
  component: () => (
    <Legal title="Confidentialité">
      <p>Le compte stocke l’identifiant, l’e-mail, le nom affiché et le rôle. Les wallets ne gardent que l’adresse publique que vous choisissez de relier.</p>
      <p>Aucune clé privée, aucune phrase secrète. Les décisions, ordres simulés et messages à l’assistant restent rattachés à votre identifiant et ne sont pas lisibles par un autre client.</p>
      <p>L’administration voit les comptes, les offres et l’état des bots. Les adresses complètes ne sont pas reprises dans la liste des bots.</p>
      <p>Si l’assistant appelle l’API xAI, le message et un extrait de votre bureau simulé partent vers ce prestataire, depuis le serveur, avec la clé du propriétaire de l’application.</p>
    </Legal>
  ),
});
