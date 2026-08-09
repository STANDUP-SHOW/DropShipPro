# DropShip Pro

Automatise l'import, l'amélioration IA, le filigrane et la publication multi-plateforme
de produits en dropshipping (Temu, JoyBuy, ou n'importe quelle URL produit).

## Stack

- **Frontend** : React + TypeScript + Vite + Tailwind CSS v4 → déploiement **Vercel**
- **Backend** : Node.js + Express + TypeScript + Prisma → déploiement **Railway**
- **DB** : PostgreSQL
- **IA** : Anthropic Claude (remix titre/description + SEO)

## 1. Base de données (choisir une option, aucune install requise pour l'option A)

**Option A — Railway Postgres (recommandé, gratuit pour démarrer)**
1. Créez un projet sur [railway.app](https://railway.app), ajoutez un service **PostgreSQL**.
2. Copiez la `DATABASE_URL` fournie dans `backend/.env`.

**Option B — Docker local** (nécessite [Docker Desktop](https://www.docker.com/products/docker-desktop/))
```bash
docker compose up -d
```

**Option C — PostgreSQL installé nativement sur Windows**
Installez depuis [postgresql.org](https://www.postgresql.org/download/windows/), puis adaptez `DATABASE_URL`.

## 2. Backend

```bash
cd backend
cp .env.example .env   # renseignez DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY
npm install
npx prisma migrate dev --name init
npm run dev             # http://localhost:4000
```

## 3. Frontend

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173 (proxy /api -> :4000)
```

## Déploiement

- **Backend → Railway** : connectez le repo, dossier `backend/`, variables d'env
  `DATABASE_URL` (Postgres Railway), `JWT_SECRET`, `ANTHROPIC_API_KEY`, `FRONTEND_URL`
  (URL Vercel). `railway.json` gère build + migration au déploiement.
- **Frontend → Vercel** : connectez le repo, dossier `frontend/`, ajoutez une variable
  `VITE_API_URL` pointant vers le backend Railway, et un rewrite `/api/*` vers cette URL
  (ou adaptez `src/lib/api.ts` pour appeler l'URL absolue en prod).

## État des intégrations plateformes (voir Réglages dans l'appli)

| Plateforme | Statut |
|---|---|
| Mon site (catalogue public `/api/public/products`) | ✅ Automatique |
| eBay | ✅ Automatisable (Sell API) une fois connectée |
| Amazon | ⚠️ Nécessite compte vendeur Pro + validation Amazon |
| Leboncoin | 🟠 Pas d'API self-service — publication assistée (copier-coller + photos) |
| Vinted | 🟠 Pas d'API publique — publication assistée, extension navigateur prévue |

## Mobile

Le frontend est responsive mobile-first. Pour une appli installable iOS/Android sans
dupliquer le code, ajouter [Capacitor](https://capacitorjs.com/) par-dessus le build Vite.
