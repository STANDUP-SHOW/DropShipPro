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

### 1. Backend → Railway

Dans le projet Railway qui héberge déjà votre Postgres : **New → GitHub Repo**,
répertoire racine `backend`.

Variables d'environnement à définir :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | référencez le service Postgres (`${{Postgres.DATABASE_URL}}`) |
| `JWT_SECRET` | une longue chaîne aléatoire |
| `ANTHROPIC_API_KEY` | votre clé console.anthropic.com |
| `FRONTEND_URL` | l'URL Vercel, une fois l'étape 2 faite |

⚠️ **Montez un volume sur `/app/storage`.** Le système de fichiers de Railway est
éphémère : sans volume, **toutes les photos filigranées sont perdues à chaque
redéploiement**. Railway → service backend → *Variables* → *Volumes* → *Add volume*,
point de montage `/app/storage`.

`railway.json` lance déjà `prisma migrate deploy` avant le démarrage.

### 2. Frontend → Vercel

**Add New → Project**, répertoire racine `frontend`. Vercel détecte Vite tout seul.

Une seule variable : `VITE_API_URL` = l'URL publique du backend Railway
(ex. `https://droppost-backend-production.up.railway.app`).

Revenez ensuite définir `FRONTEND_URL` côté Railway avec l'URL Vercel, sinon le
navigateur bloquera les appels (CORS).

### 3. Extension

Ouvrez le popup de l'extension → **Configurer les adresses**, et renseignez les deux
URL de production. L'extension enregistre aussi le pont vers le domaine de l'appli,
ce qui autorise le bouton « Diffuser » à la piloter.

## État des intégrations plateformes (voir Réglages dans l'appli)

| Plateforme | Statut |
|---|---|
| Mon site (catalogue public `/api/public/products`) | ✅ Automatique |
| eBay | ✅ Sell API en self-service |
| Google Shopping | ✅ Content API for Shopping (Merchant Center gratuit) |
| Amazon | ⚠️ Selling Partner API — compte vendeur Pro payant + validation Amazon |
| Cdiscount | ⚠️ API Marketplace — compte vendeur validé requis |
| TikTok Shop | ⚠️ Partner API — boutique approuvée requise |
| Facebook Marketplace | 🟠 Pas d'API pour les annonces — extension navigateur |
| Leboncoin | 🟠 API réservée aux partenaires pros — extension navigateur |
| Vinted | 🟠 Pas d'API publique — extension navigateur |

Les destinations sont déclarées à un seul endroit,
[`backend/src/services/platforms.ts`](backend/src/services/platforms.ts) : les schémas de
validation, le back-office et l'extension lisent tous cette liste. Ajouter une
marketplace demande donc d'éditer ce fichier, les chemins de catégorie dans
`categoryCatalog.ts`, et l'enum `Platform` de Prisma.

Les catégories de destination utilisent la **taxonomie produit Google** pour Google
Shopping et Facebook (qui acceptent `google_product_category`), et des chemins
propres à chaque plateforme pour les autres.

## Extension navigateur

`extension/` contient une extension Chrome (Manifest V3) qui remplit automatiquement
les formulaires de vente Vinted / Leboncoin / eBay avec vos produits, façon
Vendoo ou Crosslist. Voir [extension/README.md](extension/README.md) pour l'installation.

## Mobile

Le frontend est responsive mobile-first. Pour une appli installable iOS/Android sans
dupliquer le code, ajouter [Capacitor](https://capacitorjs.com/) par-dessus le build Vite.
