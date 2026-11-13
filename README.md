# Grok Bot

Plateforme SaaS indépendante de trading simulé (Grok Bot).

Ce dépôt est **nouveau et séparé** des autres projets du compte
(`Ton-Plug-2-France`, `aurion-desk`, `encaisse`, etc.). Il ne partage ni
Stripe, ni base, ni clients avec le premier site.

## Lancer en local

```bash
npm install
npm run dev
```

L’interface démarre sur le port 8080.

Les clés Stripe, la base et l’authentification se configurent via les
variables d’environnement du déploiement. Ne jamais y coller un Price ID
du premier site.
