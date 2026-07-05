# RAP — Serveur relais C2

Serveur central pour les connexions distantes (prof + élèves hors réseau).

## Déploiement Render.com

1. Créez un repo GitHub et uploadez **tout le contenu de ce dossier**
2. Sur [render.com](https://render.com) → **New → Blueprint** (ou Web Service)
3. Connectez le repo
4. Nom du service : **`rap-relay`**
5. URL finale : `https://rap-relay.onrender.com` → `wss://rap-relay.onrender.com`

Render utilise `render.yaml` automatiquement avec Blueprint.

### Web Service manuel

| Champ | Valeur |
|-------|--------|
| Build Command | `npm install && npm run build -w @salle/shared && npm run build -w @salle/relay` |
| Start Command | `node apps/relay/dist/index.js` |
| Plan | Free |

## Test local

```bash
npm install
npm run build -w @salle/shared
npm run build -w @salle/relay
npm run start -w @salle/relay
```

Ouvrez `http://127.0.0.1:9850` — vous devez voir `{"service":"RAP Relay",...}`.
