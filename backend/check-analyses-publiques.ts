/**
 * Banc : les pages publiques /analyses/ montrent l'analyse et les produits
 * gagnants — et JAMAIS l'adresse fournisseur ni le prix d'achat, qui sont ce
 * que le compte à 500 drops achète. Éprouvé sur un rapport bâti comme les vrais
 * (le tableau des produits, avec ses adresses, est dans le corps Markdown).
 */
import { aAnnoncer } from './src/services/annonceAnalyses.js'
import { ancienCheminRapport, attribuerAdresses, datesPubliques, empreintePublique, rendusMigres, texteRefait, blocsDe, cheminArticleDate, cheminRapport, rapportA, sujetRapport, markdownEnHtml, pageCategorie, pageIndex, pageJour, pageRapport, sitemapXml, titreRapport, TITRE_MAX, type RapportPublic } from './src/services/analysesPubliques.js'
import { lireRapport } from './src/services/marketReports.js'

let echecs = 0
function exige(condition: boolean, nom: string, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const md = `---
type: rayon
date: 2026-09-18
categorie: telephonie
theme: chargeurs-cables
titre: Chargeurs GaN et câbles tressés — ce qui se vend en septembre
accroche: Le GaN a gagné, et les câbles tressés font la marge.
sources: 8
---

## Analyse
Le marché des chargeurs bascule vers le **GaN 65 W**. Les câbles tressés se vendent 3 fois leur prix d'achat, voir [cette étude](https://exemple.test/etude). Attention aux <script>alert(1)</script> contrefaçons.

- Les 3 ports deviennent la norme
- Le câble USB-C 100 W est l'accessoire le plus recherché

## 2 produits proposés

| # | Titre | Fournisseur | URL fournisseur | Prix achat € | Prix vente conseillé € | Marge % | Import | Pourquoi |
|---|-------|-------------|-----------------|--------------|------------------------|---------|--------|----------|
| 1 | Chargeur GaN 65 W 3 ports | CJ Dropshipping | https://fournisseur.test/secret-1 | 9,80 | 24,90 | 61 | api | Tendance forte (9,80 US$ relevé sur la fiche), forte demande avant Noël |
| 2 | Câble USB-C 100 W tressé 2 m | AliExpress | https://fournisseur.test/secret-2 | 1,90 | 9,90 | 81 | extension | Marge ; 1,90 € chez AliExpress |
| 3 | Batterie externe 20 000 mAh | BigBuy | https://fournisseur.test/secret-3 | 12,50 | 34,90 | 64 | api | Rentrée |
| 4 | Support voiture magnétique | CJ Dropshipping | https://fournisseur.test/secret-4 | 2,10 | 12,90 | 84 | api | Volume |
| 5 | Chargeur sans fil 15 W | Temu | https://fournisseur.test/secret-5 | 4,30 | 19,90 | 78 | extension | Marge |
`

const lu = lireRapport(md)
const rapport: RapportPublic = {
  ...lu,
  id: 'rayon-2026-09-18-telephonie-chargeurs-cables',
  categorieNom: 'Téléphonie',
  themeNom: 'Chargeurs, câbles et batteries externes',
  prompts: [],
  updatedAt: new Date('2026-09-18T07:00:00Z'),
}
const marketing: RapportPublic = {
  ...rapport,
  type: 'marketing',
  titre: 'Vendre des chargeurs GaN : angles et prompts',
  id: 'marketing-2026-09-18-telephonie-chargeurs-cables',
  produits: [],
  // Le corps-souche que MarketSpy écrit aux rapports marketing : rien à montrer.
  body: 'Vendre des chargeurs GaN : angles et prompts',
  prompts: [
    { genre: 'image', format: '1:1 — Instagram', texte: 'Un chargeur GaN blanc sur un bureau en chêne, lumière du matin' },
    { genre: 'video', format: 'TikTok / Reels', texte: 'hook 0-3 s : ton chargeur chauffe ? le GaN, non.' },
  ],
}

console.log('La page d’un rapport rayon')
{
  const html = pageRapport(rapport, [marketing])
  exige(html.includes('<title>Chargeurs GaN et câbles tressés'), 'le titre du rapport est le titre de la page')
  exige(html.includes('GaN 65 W') && html.includes('<strong>GaN 65 W</strong>'), 'l’analyse est rendue, gras compris')
  exige(html.includes('Chargeur GaN 65 W 3 ports') && html.includes('Câble USB-C 100 W tressé 2 m'), 'les produits gagnants sont nommés')
  exige(html.includes('24,90 €') && !/61 %|81 %/.test(html), 'le prix de vente conseillé est public, la marge non (unité incertaine)')
  exige(!html.includes('fournisseur.test/secret'), 'AUCUNE adresse fournisseur ne sort')
  exige(!/9,80|1,90/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')), 'AUCUN prix d’achat ne sort')
  exige(!html.includes('<script>alert'), 'le HTML du rapport est échappé')
  exige(html.includes('href="https://exemple.test/etude" rel="nofollow'), 'les liens du corps sont en nofollow')
  exige(html.includes(`<link rel="canonical" href="https://www.drop-shipper.fr${cheminRapport(rapport)}">`), 'l’adresse canonique est sous www.drop-shipper.fr')
  exige(html.includes('"@type":"NewsArticle"') && html.includes('"@type":"ItemList"') && html.includes('"@type":"BreadcrumbList"'), 'schema.org : NewsArticle, ItemList, fil d’Ariane')
  exige(html.includes(cheminRapport(marketing)), 'le rapport marketing du même jour est lié')
  exige(html.includes('produits gagnants'), 'le bloc des produits est retitré « gagnants »')
  const ld = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1])
  exige(!JSON.stringify(ld).includes('fournisseur.test'), 'ni dans les données structurées')
  exige(!/<th>Fournisseur<\/th>/.test(html) && !/CJ Dropshipping|AliExpress|BigBuy|Temu/.test(html), 'AUCUN nom de fournisseur ne sort (règle de Max, PR #24)')
  exige(!/9,80|1,90|US\$|relevé sur la fiche/.test(html), 'ni prix d’achat glissé dans « pourquoi », données structurées comprises')
  exige(html.includes('Tendance forte, forte demande avant Noël'), '« pourquoi » garde ce qui ne trahit pas l’achat')
}

console.log('\nUn rapport MarketSpy : les produits sont à part, pas dans le corps')
{
  const sansTableau: RapportPublic = { ...rapport, body: '## Ce qu’il faut retenir\n**Opportunité** : les docks eGPU.\n' }
  const html = pageRapport(sansTableau)
  exige(html.includes('<h2 id="produits">5 produits gagnants</h2>') && html.includes('Chargeur GaN 65 W 3 ports'), 'le tableau est ajouté quand le corps ne le porte pas')
  exige((html.match(/id="produits"/g) || []).length === 1 && (pageRapport(rapport).match(/id="produits"/g) || []).length === 1, 'et jamais deux fois')
  exige(!html.includes('fournisseur.test/secret'), 'toujours sans adresse fournisseur')
}

console.log('\nUn rapport complet importé (MARKETSPY, 16 sections) : rien de l’achat, dans aucune section')
{
  const complet: RapportPublic = {
    ...rapport,
    body: [
      '## Executive Summary',
      "Le lavage nomade progresse. L'achat unitaire AliExpress est perdant, le lot Alibaba passe. La demande double au printemps.",
      '## Verdict rapide',
      '- Mini lave-linge : coût rendu 32 €, vente 89 €.',
      '- Filtre : à éviter, trop de retours.',
      '## Analyse sourcing',
      'Trois usines comparées sur leurs délais.',
      '## TOP 20 produits gagnants',
      'Classement du jour.',
      '',
      '| Rang | Produit | Source achat | Coût rendu FR | Prix vente cible | Marge nette estimée |',
      '| --- | --- | --- | --- | --- | --- |',
      '| 1 | Chargeur GaN 65 W 3 ports | Usine | 9,80 € | 24,90 € | 8 € |',
      '## Battle sheet achat / revente',
      '| Produit | Fournisseur | URL |',
      '| --- | --- | --- |',
      '| Chargeur GaN | Usine X | https://fournisseur.test/secret-battle |',
      '## Bundles recommandés',
      '| Bundle | Coût | Prix |',
      '| --- | --- | --- |',
      '| Duo | 12 € | 39 € |',
      '## Sources',
      '- https://fournisseur.test/secret-source',
      '## Décision finale',
      'Tester les trois premiers.',
    ].join('\n'),
  }
  const html = pageRapport(complet)
  const visible = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
  exige(!/aliexpress|alibaba/i.test(visible), 'aucun fournisseur nommé dans le texte d’analyse', (/[^.]*(aliexpress|alibaba)[^.]*/i.exec(visible) || [''])[0])
  exige(visible.includes('Le lavage nomade progresse.') && visible.includes('La demande double au printemps.'), 'le reste de la phrase et du paragraphe est gardé')
  exige(!/32 €|9,80|coût rendu/i.test(visible), 'aucun coût rendu ni prix d’achat, même dans une puce')
  exige(visible.includes('Filtre : à éviter'), 'la puce sans chiffre d’achat reste')
  exige(!/Analyse sourcing|Battle sheet|secret-battle|secret-source|<h2>Sources/.test(visible), 'les sections sourcing, battle sheet et sources restent dans l’espace connecté')
  exige(!/Marge nette|8 €|Duo/.test(visible), 'ni marge ni coût des bundles')
  exige((visible.match(/id="produits"/g) || []).length === 1 && visible.includes('Chargeur GaN 65 W 3 ports'), 'le TOP 20 devient la liste bridée, à sa place, une fois')
  exige(visible.includes('Tester les trois premiers.'), 'la décision finale est publiée')
}

console.log('\nConstat en ligne du 12/10/2026 au soir : plafonds d’achat, libellés, intertitres orphelins')
{
  const constat: RapportPublic = {
    ...rapport,
    body: [
      '## Verdict rapide',
      '- Produit à éviter : mini lave-vaisselle acheté à l’unité sur AliExpress (n° 9), coût rendu supérieur au prix Cdiscount ; pastilles nettoyantes importées (n° 4), risque chimique.',
      '- Le « petit lavage » : demande réelle chez les étudiants, mais l’achat unitaire AliExpress est perdant.',
      '- Opinion : 41 % des acheteurs hésitent, et 51 % des achats suivent une panne.',
      '## Bundles recommandés',
      'Ils deviennent plus rentables en lot (voir les prix max d’achat). Le bundle sérénité est rentable.',
      '',
      '### Tableau 5 — Plan de test',
      '',
      '| Produit | Quantité test | Budget achat |',
      '| --- | --- | --- |',
      '| Attrape-poils | 10 | 41,30 € |',
      '',
      '### Montée en volume',
      'Règle : 5 → 10 → 25 unités.',
      '',
      'Premier bon de commande chiffré (à valider après devis) :',
      '',
      '| Ligne | Coût rendu unitaire |',
      '| --- | --- |',
      '| Attrape-poils | ≤ 4,13 € |',
      '## Décision finale',
      '- Négocier : mini machine en lot Alibaba (objectif ≤ 12,25 € rendu) ; attrape-poils en lot (≤ 4,13 € le lot de 6 rendu) ; lave-linge d’occasion (≤ 121,36 € pièces et transport compris).',
      '- Liste de surveillance : séchoir B2B (≤ 10,33 €), socles et surélévateurs, CJ Dropshipping EU, balles de laine.',
      '- Commander 2 échantillons de répéteurs génériques (17,36 €).',
      '- Budget test recommandé : environ 600 €.',
    ].join('\n'),
  }
  const visible = pageRapport(constat).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
  exige(!/4,13|12,25|121,36|10,33|17,36|41,30|prix max/i.test(visible), 'aucun plafond ni prix d’achat (« ≤ 4,13 € rendu », « prix max d’achat », échantillons)', (/[^>]*(4,13|12,25|121,36|10,33|17,36|prix max)[^<]*/i.exec(visible) || [''])[0])
  exige(visible.includes('Produit à éviter : pastilles nettoyantes importées (n° 4), risque chimique.'), 'le libellé de la puce reste avec ce qui reste d’elle')
  exige(visible.includes('demande réelle chez les étudiants'), 'une puce garde sa partie publique')
  exige(visible.includes('51 % des achats suivent une panne'), '« achats » des clients et un pourcentage ne sont pas un prix d’achat')
  exige(visible.includes('Négocier : attrape-poils en lot ; lave-linge d’occasion.'), 'les parenthèses de plafond tombent, la phrase reste')
  exige(visible.includes('Liste de surveillance : séchoir B2B, socles et surélévateurs, balles de laine.'), 'dans une liste, seul l’élément qui nomme un fournisseur tombe')
  exige(!/Tableau 5|Premier bon de commande/.test(visible) && visible.includes('Montée en volume'), 'un intertitre ou une annonce dont le tableau est retiré tombe avec lui')
  exige(visible.includes('environ 600 €'), 'le budget de test reste')
}

console.log('\nDeuxième constat du 12/10/2026 au soir : la Synthèse de réseau, les renvois, les achats chiffrés')
{
  const constat: RapportPublic = {
    ...rapport,
    body: [
      '## Synthèse',
      'Pour un revendeur, trois constats :',
      '',
      '1. **La revente de routeurs de marque importés ne marche pas** : GL.iNet vend lui-même sur Amazon.',
      '2. **Seuls les répéteurs génériques importés par lots identiques gardent une marge**, faible : environ 3,34 € nets par lot de 2 (ROI ≈ 24 %), à condition de négocier sous 11,10 € rendus et de valider la conformité radio.',
      '3. **Le service posé est la vraie piste.**',
      '## Bundles recommandés',
      'Le bundle Mini 2 est calculé avec un achat à 180 € (annonce Fly More observée) ; la sacoche n’est pas sourcée et n’est pas comptée.',
      'Le coffret gravé exclut le coût de gravure (non vérifié) ; l’Apple Watch est comptée à 130 € d’achat.',
      '## Décision finale',
      '- Budget test recommandé : environ 600 € (bon de commande en « Bundles recommandés »).',
    ].join('\n'),
  }
  const visible = pageRapport(constat).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
  exige(!/3,34|11,10|24 %|180 €|130 €/.test(visible), 'ni le net par lot, ni le plafond de négociation, ni un achat chiffré', (/[^>]*(3,34|11,10|180 €|130 €)[^<]*/.exec(visible) || [''])[0])
  exige(visible.includes('Pour un revendeur, trois constats :') && visible.includes('gardent une marge</strong>, faible.'), 'un constat en gras reste seul quand ses chiffres partent : la liste garde ses trois points')
  exige(visible.includes('GL.iNet vend lui-même') && visible.includes('vraie piste'), 'les autres points de la Synthèse restent')
  exige(!/sacoche|coût de gravure|180 €/.test(visible), 'les notes des bundles qui parlent de ce qui est compté ou non tombent avec leurs chiffres')
  exige(visible.includes('environ 600 €') && !/bon de commande/.test(visible), 'un renvoi au bon de commande, retiré de la page, tombe')
}

console.log('\nTroisième constat du 12/10/2026 au soir : coûts déguisés, phrases coupées, bundles vides, renvois')
{
  const constat: RapportPublic = {
    ...rapport,
    body: [
      '## Synthèse',
      'Pour un revendeur, trois constats :',
      '',
      '1. **Le lecteur OBD2 acheté en B2B est la meilleure opportunité** : 14 à 16 $ pièce chez des fournisseurs Alibaba. En boutique, ≈ 6,26 € nets par vente (ROI ≈ 37 %)',
      '2. **La fabrication maison est la meilleure marge du rayon** : 4,37 € de matières pour une bougie de 180 g. Le frein n’est pas le prix mais la conformité.',
      '3. **Importer des drones ne marche pas** : le Neo 2 coûte ≈ 270 € rendus ; les drones chinois se heurtent à Cdiscount dès 38,27 €.',
      '',
      'Budget de test recommandé : environ 705 €, dont 511 € de drones d’occasion revendables rapidement (détail en « Décision finale »).',
      'Saisonnalité détaillée : voir le fichier marketing.',
      '## Prix de revente',
      '| Produit | Prix bas observé | Prix haut observé | Prix cible retenu |',
      '|---|---|---|---|',
      '| Lave-linge d’occasion révisé | 50 € (brut) | 340 € | 199 € |',
      '## Bundles recommandés',
      '| Bundle | Contenu | Coût rendu actuel | Prix de vente | Marge nette estimée | ROI | Cible | Plateforme |',
      '|---|---|---|---|---|---|---|---|',
      '| DJI Mini 2 d’occasion prêt à voler | DJI Mini 2 contrôlé + Sacoche (non sourcée, exclue du coût) | 180,00 € | 289,00 € | 56,93 € | 32 % | Débutants | Leboncoin |',
      '',
      'Les packs posés sont calculés avec le matériel acheté au prix public TTC et 10 € de déplacement (hypothèse). Les prix de vente des packs sont des prix cibles.',
      '',
      '### Montée en volume',
      'Règle de montée en volume (identique à l’étude Smartphones) : 5 → 10 → 25 → 50 unités.',
      '## Décision finale',
      '- Éviter : Vgate au détail AliExpress, boosters seuls sur marketplace, revente de TOPDON.',
      '- Budget test recommandé : environ 245 € hors frais de port Alibaba.',
    ].join('\n'),
  }
  const visible = pageRapport(constat).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
  exige(!/511|50 € \(brut\)|10 € de déplacement|180,00|56,93|6,26|4,37|270 €|Alibaba|AliExpress/.test(visible), 'ni part d’achat dans un budget, ni prix brut, ni frais supposés, ni coût de bundle', (/[^>]*(511|brut|déplacement|180,00|56,93|6,26|4,37|270 €|Alibaba|AliExpress)[^<]*/.exec(visible) || [''])[0])
  exige(visible.includes('meilleure opportunité</strong>.') && !/En boutique\./.test(visible), 'un reste trop court pour tenir seul (« En boutique. ») tombe, le constat reste')
  exige(visible.includes('meilleure marge du rayon</strong>. Le frein n’est pas le prix'), 'après une première phrase retirée, la suite devient une phrase, pas l’explication du libellé')
  exige(visible.includes('ne marche pas</strong>. Les drones chinois se heurtent à Cdiscount'), 'avec une majuscule')
  exige(visible.includes('environ 705 € (détail en'), 'le budget garde son total, sans sa part de stock')
  exige(visible.includes('Saisonnalité détaillée : voir l’analyse marketing du même jour.') || visible.includes("Saisonnalité détaillée : voir l'analyse marketing du même jour."), 'le fichier marketing devient l’analyse du même jour')
  exige(visible.includes('<td>Lave-linge d’occasion révisé</td><td>—</td><td>340 €</td>'), 'un prix « brut » sort de son tableau, la ligne reste')
  exige(visible.includes('<td>DJI Mini 2 d’occasion prêt à voler</td><td>DJI Mini 2 contrôlé + Sacoche</td><td>289,00 €</td>') && !/<th>(Coût|Marge|ROI)/.test(visible), 'le tableau des bundles reste, sans ses colonnes de coût : le « Meilleur bundle » du verdict se retrouve')
  exige(visible.includes('Les prix de vente des packs sont des prix cibles.'), 'la phrase publique d’après reste')
  exige(!/Smartphones/.test(visible) && visible.includes('Règle de montée en volume : 5'), 'un renvoi à une autre étude tombe')
  exige(visible.includes('Éviter : boosters seuls sur marketplace, revente de TOPDON.'), 'une liste « Éviter » perd son seul élément fournisseur, même en tête')
  exige(visible.includes('Budget test recommandé : environ 245 €.'), 'le budget perd « hors frais de port Alibaba », pas la ligne')
}

console.log('\nQuatrième constat du 12/10/2026 au soir : la date suit le texte public, les notes de coût des bundles')
{
  const constat: RapportPublic = {
    ...rapport,
    body: [
      '## Synthèse',
      'Le rayon entre dans sa saison forte : la demande culmine en décembre ([Accio](https://fr.accio.com/business/bougies-tendance)). Les parfums les plus demandés sont la vanille et le santal.',
      '## Bundles recommandés',
      '| Bundle | Contenu | Coût rendu actuel | Prix de vente |',
      '|---|---|---|---|',
      '| Coffret cocooning | Lampe + bougie | 12,00 € | 39,99 € |',
      '',
      'Les bundles additionnent les coûts unitaires repris du top 20. Les prix de vente sont des prix cibles recommandés, non observés.',
      'Ils deviennent nettement plus rentables en lot. Seuls le kit studio et le bundle « sérénité » sont rentables dès aujourd’hui.',
    ].join('\n'),
  }
  const visible = pageRapport(constat).replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
  exige(visible.includes('saison forte : les parfums les plus demandés'), 'après un libellé, la phrase restante prend une minuscule')
  exige(!/co[uû]ts? unitaires|rentables/.test(visible) && visible.includes('Les prix de vente sont des prix cibles recommandés'), 'les notes des bundles ne parlent plus de coûts qu’on ne voit pas')
  exige(visible.includes('<td>Coffret cocooning</td>'), 'le tableau des bundles reste')

  const t0 = new Date('2026-10-12T19:00:00Z')
  const t1 = new Date('2026-10-12T20:00:00Z')
  const donnees = new Date('2026-10-12T10:00:00Z')
  const avant = empreintePublique(constat)
  exige(avant === empreintePublique({ ...constat, updatedAt: new Date() }), 'l’empreinte ne dépend pas de la date affichée')
  exige(avant !== empreintePublique({ ...constat, body: constat.body.replace('vanille', 'figue') }), 'un texte public changé change l’empreinte')
  const premier = datesPubliques([{ id: 'a', updatedAt: donnees, empreinte: 'x' }, { id: 'b', updatedAt: donnees, empreinte: 'y', texteRefait: true }], {}, t0)
  exige(premier.dates.get('a')?.getTime() === donnees.getTime(), 'vu pour la première fois : la date des données (pas de lastmod du jour pour 87 pages)')
  exige(premier.dates.get('b')?.getTime() === t0.getTime(), 'un texte MARKETSPY refait le 12/10 vu pour la première fois : daté de maintenant')
  const meme = datesPubliques([{ id: 'a', updatedAt: donnees, empreinte: 'x' }, { id: 'b', updatedAt: donnees, empreinte: 'y', texteRefait: true }], premier.connus, t1)
  exige(!meme.change && meme.dates.get('b')?.getTime() === t0.getTime(), 'rien de changé : la date reste, rien n’est réécrit')
  const autre = datesPubliques([{ id: 'a', updatedAt: donnees, empreinte: 'x2' }, { id: 'b', updatedAt: donnees, empreinte: 'y', texteRefait: true }], premier.connus, t1)
  exige(autre.change && autre.dates.get('a')?.getTime() === t1.getTime() && autre.dates.get('b')?.getTime() === t0.getTime(), 'le texte public d’un rapport change : sa date avance, pas celle des autres')
  exige(texteRefait({ body: '## Synthèse\nLe marché…' }, true) && !texteRefait({ body: '## Analyse\nRentrée 2026…' }, true) && !texteRefait({ body: '## Synthèse' }, false), 'seul un import MARKETSPY (sans « ## Analyse ») a vu son texte refait le 12/10')
  const v1 = { 'rayon-2026-10-08-x': { empreinte: 'e', le: '2026-10-12T19:40:31.942Z' }, 'rayon-2026-10-12-y': { empreinte: 'f', le: '2026-10-12T19:40:31.942Z' } }
  const migres = rendusMigres(v1, new Set(['rayon-2026-10-12-y']))
  exige(!('rayon-2026-10-08-x' in migres) && migres['rayon-2026-10-12-y']?.le === '2026-10-12T19:40:31.942Z', 'le magasin de #77 oublie la date « maintenant » des anciens imports (07/10, 08/10), garde celle des textes refaits')
  exige(rendusMigres({ version: 4, rapports: v1 }, new Set())['rayon-2026-10-08-x']?.empreinte === 'e', 'un magasin à jour est lu tel quel')
  exige(!('rayon-2026-10-08-x' in rendusMigres({ version: 3, rapports: v1 }, new Set(['rayon-2026-10-12-y']))), 'le magasin de #79 (version 3) est trié de même')
  exige(!('rayon-2026-10-08-x' in rendusMigres({ version: 2, rapports: v1 }, new Set(['rayon-2026-10-12-y']))), 'le magasin de #78 (version 2) est trié de même')
  exige(!texteRefait({ body: '## Analyse\nTitre', type: 'marketing' }, true) && !texteRefait({ body: '## Angles\n…', type: 'marketing' }, true), 'un rapport marketing n’a pas vu son texte refait (souche MARKETSPY ou ancien format)')
}

console.log('\nLa page d’un rapport marketing')
{
  const html = pageRapport(marketing)
  exige(html.includes('<figure class="prompt"><figcaption>1:1 — Instagram</figcaption>') && html.includes('<figcaption>TikTok / Reels</figcaption>'), 'chaque prompt est un bloc copiable avec son format')
  exige(!html.includes('<h2>Analyse</h2>') && !html.includes('<p>Vendre des chargeurs GaN'), 'le corps-souche n’est pas rendu comme une analyse')
  const souche = pageRapport({ ...marketing, body: '## Analyse\nVendre des chargeurs GaN : angles et prompts' })
  exige(!souche.includes('<h2>Analyse</h2>'), 'ni sous sa forme MarketSpy « ## Analyse » + titre')
  exige(html.includes('Un chargeur GaN blanc'), 'le texte du prompt est là')
  exige(!html.includes('"@type":"ItemList"'), 'pas de liste de produits sur un rapport marketing')
}

console.log('\nL’archive, l’index, le sitemap')
{
  const cat = pageCategorie('telephonie', [rapport, marketing])
  exige(cat.includes('18 septembre 2026') && cat.includes(cheminRapport(rapport)) && cat.includes(cheminRapport(marketing)), 'l’archive liste les deux rapports du jour')
  const index = pageIndex([rapport], new Map([['telephonie', 2]]))
  exige(index.includes('/analyses/telephonie/') && index.includes('2 analyses'), 'l’index compte par catégorie')
  const xml = sitemapXml([rapport, marketing])
  exige(xml.includes('<loc>https://www.drop-shipper.fr/analyses/</loc>'), 'le sitemap porte l’index')
  exige(xml.includes('<loc>https://www.drop-shipper.fr/analyses/telephonie/</loc>'), 'et la catégorie')
  exige(xml.includes(`<loc>https://www.drop-shipper.fr${cheminRapport(rapport)}</loc>`) && xml.includes(`<loc>https://www.drop-shipper.fr${cheminRapport(marketing)}</loc>`), 'et chaque rapport')
  exige(
    cheminRapport(rapport) === '/analyses/chargeurs-cables/chargeurs-gan-et-cables-tresses-ce-qui-se-vend-en-septembre/' &&
      cheminRapport(marketing) === '/analyses/chargeurs-cables/vendre-des-chargeurs-gan-angles-et-prompts/',
    'les adresses se lisent comme des articles : le thème, puis le sujet, ni catégorie ni date',
    cheminRapport(rapport),
  )
  exige(ancienCheminRapport(rapport) === '/analyses/telephonie/2026-09-18/chargeurs-cables/', 'la première adresse reste calculable, pour la redirection')
  exige(
    cheminArticleDate(rapport) === '/analyses/telephonie/chargeurs-gan-et-cables-tresses-ce-qui-se-vend-en-septembre-2026-09-18/',
    'l’adresse de la PR #25 aussi',
  )
}

console.log('\nLe sujet : titre du jour, sinon titre + extrait percutant')
{
  const sujet = sujetRapport({ ...rapport, extrait: 'Le GaN a gagné, et les câbles tressés font la marge.' })
  exige(sujet === 'chargeurs-gan-et-cables-tresses-ce-qui-se-vend-en-septembre-gagne-font-marge', 'l’extrait complète le titre sans répéter ses mots', sujet)
  const une = sujetRapport({ ...rapport, une: 'Les télés très demandées au Q4 et au Black Friday 2026' })
  exige(une === 'les-teles-tres-demandees-au-q4-et-au-black-friday', 'le titre du jour, quand il existe, fait l’adresse', une)
  exige(sujetRapport({ ...rapport, titre: 'x'.repeat(30) + ' ' + 'y'.repeat(30), extrait: 'z'.repeat(80) }).length <= 100, 'jamais plus de 100 caractères')

  // Même sujet, deux jours : le premier publié garde l'adresse nue, et l'arrivée d'un troisième ne la change pas.
  const j1 = { ...rapport, id: 'r1', day: '2026-09-18' }
  const j2 = { ...rapport, id: 'r2', day: '2026-09-19' }
  const j3 = { ...rapport, id: 'r3', day: '2026-09-20' }
  attribuerAdresses([j2, j1])
  const avant = [cheminRapport(j1), cheminRapport(j2)]
  exige(avant[0].endsWith('-septembre/') && avant[1].endsWith('-septembre-2/'), 'collision : -2 pour le second publié', avant.join(' '))
  attribuerAdresses([j3, j1, j2])
  exige(cheminRapport(j1) === avant[0] && cheminRapport(j2) === avant[1] && cheminRapport(j3).endsWith('-3/'), 'une adresse publiée ne bouge plus')
  exige(rapportA(avant[1]) === 'r2', 'et chaque adresse mène à son rapport')
  attribuerAdresses([rapport, marketing])
}

console.log('\nLe robot IndexNow')
{
  const xml = '<loc>https://a/1/</loc><loc>https://a/2/</loc><loc>https://a/2/</loc>'
  const n = aAnnoncer(xml, ['https://a/1/'])
  exige(n.length === 1 && n[0] === 'https://a/2/', 'n’annonce que les adresses nouvelles, une fois chacune')
}

console.log('\nCe que l’audit du 03/10/2026 relevait')
{
  // Le rapport bricolage du 18/09 : son tableau sous un H3, au milieu de l'analyse, sans produits structurés.
  const glisse: RapportPublic = {
    ...rapport,
    produits: [],
    body: `## Analyse\nLes outils à main reviennent, voir https://www.exemple.test/etude-outils.\n\n### 16 produits proposés\n\n| # | Titre | Fournisseur | URL fournisseur | Prix achat € | Prix vente conseillé € |\n| --- | --- | --- | --- | --- | --- |\n| 1 | Gouge 30 mm | BigBuy | https://fournisseur.test/secret-9 | 25-40 € | 40-60 € |\n`,
  }
  const html = pageRapport(glisse)
  exige(!html.includes('secret-9') && !html.includes('25-40') && !html.includes('Prix achat'), 'un tableau fournisseur glissé sous un H3 ne sort jamais')
  exige(html.includes('réservée aux comptes') && !html.includes('16 produits proposés'), 'à sa place, la mention réservée aux comptes')
  exige(html.includes('>exemple.test</a>'), 'une adresse nue se lit par son nom de site')
  const titre = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''
  exige(!/\b0 produits/.test(html) && titre.length <= TITRE_MAX, 'ni « 0 produits gagnants », ni titre trop long', titre)
  const long = titreRapport({ ...rapport, titre: 'Un titre d’agent très long qui raconte toute la tendance du jour et plus encore' })
  exige(long.length <= TITRE_MAX && long.endsWith('(18/09/2026)'), 'un titre trop long est coupé au mot, date gardée', long)
  const vide = pageCategorie('sport', [])
  exige(vide.includes('noindex, follow') && vide.includes('Aucune analyse publiée'), 'une catégorie vide : une vraie page, hors index')
  const index = pageIndex([rapport], new Map([['telephonie', 2]]))
  exige(index.includes('href="/analyses/telephonie/"') && !index.includes('href="/analyses/sport/"'), 'l’index ne lie pas les catégories vides')
}

console.log('\nL’édition du jour')
{
  const html = pageJour('2026-09-18', [rapport, marketing], '2026-09-17', '2026-09-19')
  exige(!/9,80|US\$|AliExpress|CJ Dropshipping/.test(html), 'l’édition du jour non plus : ni prix d’achat ni fournisseur')
  exige(html.includes('<title>Produits gagnants et tendances du 18/09/2026</title>') && html.includes('href="https://www.drop-shipper.fr/analyses/2026-09-18/"'), 'une page par jour, à son adresse')
  exige(html.includes('Chargeur GaN 65 W 3 ports') && html.includes(`href="${cheminRapport(rapport)}#produits"`), 'les produits gagnants du jour, liés à leur rapport')
  exige(!html.includes('fournisseur.test') && !html.includes('9,80') && !/CJ Dropshipping|BigBuy|Temu/.test(html), 'ni adresse, ni nom de fournisseur, ni prix d’achat')
  exige(html.includes('/analyses/2026-09-17/') && html.includes('/analyses/2026-09-19/'), 'les éditions voisines')
  exige(sitemapXml([rapport]).includes('<loc>https://www.drop-shipper.fr/analyses/2026-09-18/</loc>'), 'chaque édition est dans le sitemap')
  exige(pageRapport(rapport).includes('"@type":"NewsArticle"'), 'un rapport se déclare comme une actualité')
}

console.log('\nLe Markdown')
{
  exige(markdownEnHtml('| a | b |\n|---|---|\n| 1 | 2 |').includes('<td>2</td>'), 'un tableau')
  exige(markdownEnHtml('1. un\n2. deux').startsWith('<ol>'), 'une liste ordonnée')
  exige(markdownEnHtml('### Sous-titre\ntexte').includes('<h3>Sous-titre</h3>'), 'un H3')
  exige(blocsDe('## A\nx\n## B\ny').length === 2, 'le découpage sur les H2')
}

if (echecs) {
  console.error(`\n${echecs} attente(s) manquée(s).`)
  process.exit(1)
}
console.log('\nPages publiques des analyses : tout passe.')
