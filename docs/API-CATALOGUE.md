# API Catalogue DropShipper IA

Documentation destinée au développeur qui branche une boutique existante — site
codé sur mesure, projet Lovable, Next.js… — sur le catalogue DropShipper IA.

Vous gérez vos produits dans DropShipper IA, votre boutique les affiche.

---

## 1. Principe

Vous publiez une annonce sur la destination **« Mon site »** depuis DropShipper IA.
Elle devient alors disponible dans le flux public ci-dessous, que votre boutique
interroge.

- Aucune authentification : le flux est public, comme une page produit.
- Lecture seule : votre boutique ne peut rien modifier par cette API.
- Réponse en JSON, encodée en UTF-8.

---

## 2. Vos identifiants

Deux valeurs, à récupérer une fois :

| Valeur | Où la trouver | Exemple |
|---|---|---|
| **URL de l'API** | Fournie avec votre compte | `https://dropshippro-production.up.railway.app` |
| **Clé boutique** (`shopKey`) | Dans **Réglages** de DropShipper IA | `5485a2dc64a0429f94dc4016a9452e62` |

La clé boutique n'est pas un secret : elle ne donne accès qu'aux produits que vous
avez **volontairement publiés**. Elle peut figurer dans le code de votre site.

Elle est en revanche **indispensable** : sans elle, l'API ne sait pas de quelle
boutique il s'agit.

---

## 3. Points d'entrée

### Lister les produits

```
GET /api/public/shops/{shopKey}/products
```

Réponse :

```json
{
  "shop": { "name": "Ma boutique" },
  "count": 3,
  "products": [
    {
      "id": "cmsnshed9000dbil0yrkm9ywg",
      "title": "Lunettes Rectangulaires Homme Style Y2K avec Chaîne Décorative",
      "description": "Adoptez la tendance rétro Y2K…\n\nDotées de verres transparents…",
      "price": 29.85,
      "currency": "EUR",
      "images": [
        "/storage/products/lunettes-rectangulaires-homme-1-a3f9c210.jpg",
        "/storage/products/lunettes-rectangulaires-homme-2-b7d1e884.jpg"
      ],
      "variants": { "Couleur": ["Noir", "Transparent"] },
      "bulletPoints": [
        "STYLE RÉTRO Y2K : monture rectangulaire inspirée des années 2000…",
        "CHAÎNE AMOVIBLE : accessoire tendance à porter ou retirer…"
      ],
      "attributes": {
        "Matière": "Métal et plastique",
        "Couleur": "Noir",
        "Style": "Y2K rétro",
        "Public": "Homme"
      },
      "metaTitle": "Lunettes Y2K Homme avec Chaîne | Style Rétro",
      "metaDescription": "Lunettes rectangulaires style Y2K…",
      "metaKeywords": "lunettes y2k homme, lunettes chaîne, monture rectangulaire…",
      "category": "Lunettes de soleil",
      "updatedAt": "2026-08-11T09:42:18.310Z"
    }
  ]
}
```

### Un produit précis

```
GET /api/public/shops/{shopKey}/products/{id}
```

Renvoie directement l'objet produit, sans l'enveloppe `shop` / `count`.
Répond **404** si le produit n'existe pas, n'appartient pas à cette boutique, ou
n'est plus publié.

---

## 4. Points d'attention

### Les images sont des chemins relatifs

`images` contient des chemins du type `/storage/products/…jpg`, **pas** des URL
complètes. Préfixez-les par l'URL de l'API :

```js
const imageUrl = API_URL + product.images[0]
```

La première image est la photo principale : c'est l'ordre défini dans le
back-office.

### `price` est le prix de vente

C'est le prix que paie votre client, marge comprise. Le prix d'achat fournisseur
n'est jamais exposé publiquement.

### `variants` et `attributes` peuvent être vides

`variants` vaut `null` si le produit n'en a pas. `attributes` est un objet libre :
les clés varient d'un produit à l'autre (une chaussure n'a pas les mêmes attributs
qu'un parfum). Parcourez-les plutôt que d'attendre des noms précis.

### Cache

Les réponses portent un `Cache-Control: public, max-age=60`. Une modification dans
le back-office peut mettre jusqu'à une minute à apparaître sur votre boutique.

### SEO

`metaTitle`, `metaDescription` et `metaKeywords` sont générés par l'IA pour être
posés tels quels dans le `<head>` de vos pages produit. Ne les laissez pas
inutilisés : c'est une partie du travail déjà fait.

---

## 5. Intégration React (Lovable, Next.js, Vite)

Copiez ce fichier dans votre projet, par exemple `src/lib/catalogue.ts`.

```ts
const API_URL = 'https://dropshippro-production.up.railway.app'
const SHOP_KEY = '5485a2dc64a0429f94dc4016a9452e62'

export interface CatalogueProduct {
  id: string
  title: string
  description: string
  price: number
  currency: string
  images: string[]
  variants: Record<string, string[]> | null
  bulletPoints: string[]
  attributes: Record<string, string>
  metaTitle: string | null
  metaDescription: string | null
  metaKeywords: string | null
  category: string | null
  updatedAt: string
}

/** Les chemins d'images sont relatifs à l'API : cette fonction les complète. */
export function imageUrl(path: string): string {
  return path.startsWith('http') ? path : `${API_URL}${path}`
}

export function formatPrice(product: CatalogueProduct): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: product.currency,
  }).format(product.price)
}

export async function fetchProducts(): Promise<CatalogueProduct[]> {
  const res = await fetch(`${API_URL}/api/public/shops/${SHOP_KEY}/products`)
  if (!res.ok) throw new Error(`Catalogue indisponible (${res.status})`)
  const data = await res.json()
  return data.products
}

export async function fetchProduct(id: string): Promise<CatalogueProduct> {
  const res = await fetch(`${API_URL}/api/public/shops/${SHOP_KEY}/products/${id}`)
  if (!res.ok) throw new Error(`Produit introuvable (${res.status})`)
  return res.json()
}
```

### Exemple : grille de produits

```tsx
import { useEffect, useState } from 'react'
import { fetchProducts, imageUrl, formatPrice, type CatalogueProduct } from './lib/catalogue'

export function Boutique() {
  const [products, setProducts] = useState<CatalogueProduct[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts()
      .then(setProducts)
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <p>Catalogue momentanément indisponible.</p>

  return (
    <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
      {products.map((p) => (
        <a key={p.id} href={`/produit/${p.id}`}>
          {p.images[0] && (
            <img src={imageUrl(p.images[0])} alt={p.title} className="aspect-square w-full object-cover" />
          )}
          <h3 className="mt-3 text-sm">{p.title}</h3>
          <p className="font-semibold">{formatPrice(p)}</p>
        </a>
      ))}
    </div>
  )
}
```

### Exemple : page produit avec SEO

```tsx
const product = await fetchProduct(id)

// Dans le <head> — les valeurs sont déjà optimisées par l'IA
<title>{product.metaTitle ?? product.title}</title>
<meta name="description" content={product.metaDescription ?? ''} />

// Arguments de vente
<ul>
  {product.bulletPoints.map((point) => <li key={point}>{point}</li>)}
</ul>

// Caractéristiques
<dl>
  {Object.entries(product.attributes).map(([name, value]) => (
    <div key={name}><dt>{name}</dt><dd>{value}</dd></div>
  ))}
</dl>

// Tailles, couleurs…
{product.variants && Object.entries(product.variants).map(([name, values]) => (
  <fieldset key={name}>
    <legend>{name}</legend>
    {values.map((v) => <label key={v}><input type="radio" name={name} value={v} /> {v}</label>)}
  </fieldset>
))}
```

---

## 6. Ce que cette API ne fait pas

À prévoir de votre côté :

- **Le panier et le paiement.** Le catalogue est en lecture seule. Utilisez Stripe
  ou l'équivalent sur votre boutique.
- **Le stock.** Aucune quantité n'est exposée : en dropshipping elle dépend du
  fournisseur, pas de vous.
- **Les commandes.** Une vente réalisée sur votre boutique n'est pas remontée
  automatiquement dans DropShipper IA. Saisissez-la dans l'onglet **Commandes**,
  ou demandez l'ajout d'un webhook.

---

## 7. Vérifier que tout fonctionne

Collez cette adresse dans votre navigateur, en remplaçant la clé par la vôtre :

```
https://dropshippro-production.up.railway.app/api/public/shops/VOTRE_CLE/products
```

- Vous voyez du JSON avec vos produits → l'intégration peut commencer.
- `{"error":"Boutique introuvable"}` → la clé est incorrecte.
- `{"count":0,"products":[]}` → aucune annonce n'est encore publiée sur
  **« Mon site »**. Publiez-en une depuis le back-office.
