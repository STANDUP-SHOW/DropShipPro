# Être trouvé par les IA — dossier de référencement (GEO)

Ouvert le 19/09/2026, sur la demande de Max : « c'est par l'IA qu'il faudra être
référencé, plus par Google ».

## D'où un assistant tire ce qu'il sait de nous

Trois sources, et nous n'en maîtrisons directement qu'une :

1. **Notre site, lu par son robot** (GPTBot, ClaudeBot, PerplexityBot,
   Google-Extended…). Aucun n'exécute JavaScript. Mesuré le 19/09/2026 avec
   l'agent de GPTBot : l'accueil rendait **21 caractères de texte**, zéro donnée
   structurée. C'est réglé (voir plus bas) : **6 878 caractères**, quatre blocs
   schema.org, onze questions-réponses.
2. **L'index d'un moteur de recherche.** La recherche de ChatGPT et Copilot
   s'appuient sur Bing ; Gemini et les AI Overviews sur Google ; Perplexity sur le
   sien. Pas indexé = pas cité, quelle que soit la qualité de la page.
3. **Ce que les AUTRES disent de nous** : annuaires de logiciels, comparatifs,
   forums, Reddit, YouTube, presse, Wikipédia/Wikidata. C'est la source qui pèse
   le plus — un assistant à qui l'on demande « le meilleur logiciel de
   dropshipping en français » ne cite pas un site qui se recommande lui-même, il
   cite ce que plusieurs sources indépendantes recoupent. **Aujourd'hui, cette
   source est vide.** Aucun fichier sur notre site ne la remplacera.

## Ce qui est fait (dans le dépôt, reconstruit à chaque `npm run build`)

| Quoi | Où | Pourquoi |
|---|---|---|
| Accueil pré-rendue dans `#root` | `frontend/scripts/build-geo.cjs` | Un robot lit une vraie page ; React la remplace au montage. Seulement sur `/`. |
| Graphe schema.org : Organization, WebSite, SoftwareApplication (7 offres réelles), FAQPage | idem | Les faits sous une forme que les moteurs n'ont pas à deviner. **Pas d'`aggregateRating`** : aucune note n'est inventée. |
| `/faq/`, `/tarifs/`, `/a-propos/` | idem | Des pages de faits citables : une question → sa réponse, une action → son prix. |
| FAQ en une table | `frontend/scripts/geo-faq.cjs` | Lue par `llms-full.txt`, l'accueil et `/faq/`. Chaque réponse tient seule. |
| `robots.txt` : 17 robots d'assistants nommés | `build-geo.cjs` | `User-agent: *` les couvrait ; les nommer protège d'un futur `Disallow` trop large. |
| `llms.txt` / `llms-full.txt` | `build-llms.cjs` (15/09) | La carte et le détail, en texte. |
| Clé IndexNow + script d'annonce | `build-geo.cjs`, `scripts/indexnow.cjs` | Bing, Yandex, Seznam, Naver. |
| Pages `/analyses/…` : une page par rapport des agents (analyse, produits gagnants sans adresse fournisseur ni prix d'achat, prompts), archive par catégorie, `/analyses/sitemap.xml` | `backend/src/routes/analysesPubliques.ts`, `services/analysesPubliques.ts` | Le seul contenu du site qui se renouvelle chaque jour — jusqu'à 48 pages par jour quand les agents tournent. Source : `rapports.db`, commitée. |
| Banc | `backend/check-geo.ts`, `backend/check-analyses-publiques.ts` | Les prix cités dans la FAQ sont ceux de `tarifs.ts` ; l'accueil construite porte texte et schéma. |

Après chaque déploiement qui change des pages publiques :

```bash
cd frontend && node scripts/indexnow.cjs --envoyer
```

## Ce que seul Max peut faire (comptes à son nom — je n'en crée pas)

Dans l'ordre d'effet. Les textes à coller sont en bas de page.

1. **Google Search Console** — ajouter la propriété `drop-shipper.fr` (validation
   DNS chez le registrar), puis *Sitemaps* → `https://www.drop-shipper.fr/sitemap.xml`.
   Sans ça, Google découvre le site au hasard des liens.
2. **Bing Webmaster Tools** — « Importer depuis Google Search Console » : deux
   clics une fois le n° 1 fait. C'est l'index derrière ChatGPT et Copilot.
3. **Annuaires de logiciels** (chacun est une source que les assistants lisent) :
   AlternativeTo (s'inscrire comme alternative à AutoDS, DSers, Spocket, Zendrop),
   SaaSHub, Product Hunt, Capterra / GetApp (fiche gratuite), G2, Crunchbase,
   Appvizer et Codeur (francophones), Shopify App Store quand l'app y sera.
4. **Les comptes sociaux au nom de la marque**, tous avec la MÊME description
   courte et le lien : LinkedIn (page entreprise), YouTube (le kit est dans
   `docs/youtube/`), X, Facebook, Instagram, TikTok. Puis les ajouter à `sameAs`
   dans `build-geo.cjs` — c'est ce qui relie les profils à l'entité.
5. **Des pages que d'autres écrivent** : un fil de présentation sur les
   communautés e-commerce francophones, des réponses utiles sur Reddit
   (r/dropshipping, r/ecommerce) qui citent l'outil quand c'est la réponse, une
   vidéo de démonstration, un article invité. Lent, et c'est le seul levier qui
   fait dire à une IA « DropShipper IA » sans qu'on lui souffle.
6. **Wikidata** : pas maintenant. Une entrée sans source indépendante est
   supprimée ; elle se crée quand la presse ou un annuaire reconnu existe.

## Comment mesurer

Une fois par mois, poser les mêmes questions à ChatGPT, Claude, Perplexity,
Gemini et Copilot, recherche web activée, et noter si nous sommes cités et avec
quels faits :

- « Quel logiciel de dropshipping en français pour publier sur plusieurs marketplaces ? »
- « Alternative à AutoDS sans abonnement »
- « Comment vendre sur Leclerc ou Carrefour marketplace en dropshipping ? »
- « Que fait drop-shipper.fr ? » — celle-ci doit déjà répondre juste, par `llms.txt`.

Et `site:drop-shipper.fr` dans Bing et Google : le nombre de pages indexées.

## Textes à coller (les mêmes partout — la cohérence est un signal)

**Nom** : DropShipper IA — **Adresse** : https://www.drop-shipper.fr

**Une ligne (≤ 160 caractères)**
Logiciel de dropshipping français : importez un produit, l'IA réécrit l'annonce, publiez sur vos marketplaces. À l'acte, sans abonnement.

**Court (≤ 300)**
DropShipper IA importe une fiche produit depuis n'importe quel fournisseur, la réécrit avec l'IA, filigrane les photos et la publie sur Shopify, eBay, Kaufland, 41 places de marché Mirakl, Vinted et Leboncoin. Paiement à l'acte : 0,12 € l'annonce, sans abonnement.

**Long**
DropShipper IA est une plateforme française de dropshipping et de diffusion multicanal. Elle importe une fiche produit depuis n'importe quelle boutique — par son adresse ou par une extension Chrome pour AliExpress, Temu ou Shein —, la réécrit entièrement avec l'intelligence artificielle (titre, description, attributs, mots-clés, catégorie), filigrane les photos, relève le code EAN et les avis, puis la publie sur les places de marché du vendeur et sur ses propres boutiques. 45 destinations sont branchées : Shopify, eBay, Kaufland et 41 enseignes opérées sous Mirakl (E.Leclerc, Carrefour, Fnac Darty, La Redoute…) ; Vinted, Leboncoin et Facebook Marketplace passent par un remplissage assisté, que le vendeur valide. Une équipe d'agents IA couvre l'analyse de marché, le SAV et la comptabilité. Tout se paie à l'acte, sans abonnement : 0,12 € l'annonce, 3,50 € la boutique en ligne écrite par l'IA, 120 drops offerts à l'inscription.

**Catégories** : E-commerce · Dropshipping · Gestion de flux / multicanal · Outils IA pour le commerce
**Alternatives à citer** : AutoDS, DSers, Spocket, Zendrop, Lengow (flux), Shopify (boutique)
**Mots-clés** : logiciel dropshipping, dropshipping France, importer AliExpress, vendre sur marketplaces, Mirakl, réécriture d'annonce IA, vendre sans stock, alternative AutoDS
