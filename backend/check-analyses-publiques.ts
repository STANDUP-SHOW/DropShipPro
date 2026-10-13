/**
 * Banc : les pages publiques /analyses/ montrent l'analyse et les produits
 * gagnants — et JAMAIS l'adresse fournisseur ni le prix d'achat, qui sont ce
 * que le compte à 500 drops achète. Éprouvé sur un rapport bâti comme les vrais
 * (le tableau des produits, avec ses adresses, est dans le corps Markdown).
 */
import { aAnnoncer } from './src/services/annonceAnalyses.js'
import { titreProduitPublic, sansDebris, sansConseilEnLot, sansPhrasesFournisseurs, prixBasSources, promptsPublics, donneesPrivees, sansDonneesPrivees, porteUnAchat, corpsVisibleVide, sansConnecteurInitial, annoncesRecomptees, teteRecomptee, sansConsignesPoste, listesEnLigne, sansOuvertureOrpheline, sansMentionPrivee, estPrivee, pourquoiPublic, pointsAnnonces, texteRepare, sansMentionsPrivees, ancienCheminRapport, parenthesesEquilibrees, produitsNettoyes, renvoisRenumerotes, empreintePage, fixerDatesDesPages, apostrophesDuTexte, titreDansListe, apostrophesRendues, produitsUniques, attribuerAdresses, datesPubliques, empreintePublique, rendusMigres, texteRefait, blocsDe, cheminArticleDate, cheminRapport, rapportA, sujetRapport, markdownEnHtml, pageCategorie, pageIndex, pageJour, pageRapport, sitemapXml, titreRapport, TITRE_MAX, type RapportPublic } from './src/services/analysesPubliques.js'
import { lireRapport } from './src/services/marketReports.js'
import { ReportQuery } from './src/services/reportsDb.js'

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
  exige(visible.includes('Liste de surveillance : socles et surélévateurs, balles de laine.'), 'dans une liste, seul l’élément qui nomme un fournisseur tombe')
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
  exige(!/acheté en B2B|En boutique\./.test(visible), 'un conseil d’achat B2B tombe en entier, et un reste trop court pour tenir seul (« En boutique. ») avec lui')
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
  exige(visible.includes('saison forte : la demande culmine en décembre.') && !/accio/i.test(visible), 'un lien vers un fournisseur perd son adresse et son nom, la phrase reste')
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
  exige(rendusMigres({ version: 5, rapports: v1 }, new Set())['rayon-2026-10-08-x']?.empreinte === 'e', 'un magasin à jour est lu tel quel')
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

console.log('\nUne offre par fournisseur, un produit par ligne (édition du 12/10)')
{
  const p0 = rapport.produits[0]
  const offres = [
    { ...p0, rang: 1, titre: 'Attrape-poils flottant réutilisable', prixVente: 12.99 },
    { ...p0, rang: 2, titre: 'Attrape-poils flottant  réutilisable', prixVente: 17.99 },
    { ...p0, rang: 3, titre: 'Boule de séchage en laine', prixVente: null },
  ]
  const u = produitsUniques(offres)
  exige(u.length === 2 && u[0].prixMin === 12.99 && u[0].prixMax === 17.99, 'deux offres du même produit = une entrée, avec l’écart de prix')
  const html = pageJour('2026-10-12', [{ ...rapport, day: '2026-10-12', produits: offres }])
  exige((html.match(/Attrape-poils flottant/g) ?? []).length === 1, 'l’édition montre le produit une seule fois')
  exige(html.includes('12,99 à 17,99 €') && html.includes('2 produits gagnants repérés'), 'son prix en fourchette, le compte en produits distincts')
}

{
  // The report page as the router serves it: one row per product, the title counts distinct products.
  const p0 = rapport.produits[0]
  const offres = [
    { ...p0, rang: 1, titre: 'Lecteur OBD2 Vgate iCar Pro 2S', prixVente: 39.99 },
    { ...p0, rang: 2, titre: 'Lecteur OBD2 Vgate iCar Pro 2S', prixVente: 44.99 },
    { ...p0, rang: 3, titre: 'Testeur de batterie', prixVente: 19.99 },
  ]
  const produits = produitsUniques(offres).map((p, i) => ({ ...p, rang: i + 1 }))
  const r2 = { ...rapport, produits }
  const html = pageRapport(r2)
  exige((html.match(/<td>Lecteur OBD2 Vgate iCar Pro 2S<\/td>/g) ?? []).length === 1 && html.includes('39,99 à 44,99 €'), 'la page du rapport : une ligne par produit, prix en fourchette')
  exige(titreRapport({ ...r2, titre: 'Outillage' }) === 'Outillage : 2 produits (' + titreRapport({ ...r2, titre: 'Outillage' }).split('(')[1], 'le titre compte les produits distincts')
  exige(produitsUniques(produits).length === 2 && produitsUniques(produits)[0].prixMax === 44.99, 'regrouper deux fois ne change rien')
}
{
  const m = { ...marketing, titre: rapport.titre, day: rapport.day, categorie: rapport.categorie }
  const html = pageJour(rapport.day, [m, rapport])
  exige(html.includes(`>${titreDansListe(m)}</a></h3>`) && html.includes(`>${titreDansListe(rapport)}</a></h3>`) && titreDansListe(m) !== titreDansListe(rapport), 'l’étude et l’analyse marketing du même jour ont chacune leur titre')
}

{
  // Répéteur Wi-Fi générique du 12/10: two offers « À surveiller », one « Acheter si négocié ».
  const p0 = rapport.produits[0]
  const u = produitsUniques([
    { ...p0, rang: 1, titre: 'Répéteur Wi-Fi générique', prixVente: 29.99, pourquoi: 'À surveiller' },
    { ...p0, rang: 2, titre: 'Répéteur Wi-Fi générique', prixVente: 39.99, pourquoi: 'Acheter si négocié' },
    { ...p0, rang: 3, titre: 'Répéteur Wi-Fi générique', prixVente: 19.99, pourquoi: 'À surveiller' },
  ])
  exige(u.length === 1 && u[0].verdicts === "Acheter si négocié selon l'offre", 'en public, un seul verdict, le plus favorable, « selon l’offre » : ' + u[0].verdicts)
  const html = pageJour('2026-10-12', [{ ...rapport, day: '2026-10-12', produits: u }])
  exige(html.includes("Acheter si négocié selon l'offre") && !html.includes('À surveiller'), 'l’édition aussi, sans verdict par offre')
  const vgate = produitsUniques([{ ...p0, rang: 1, titre: 'Vgate', prixVente: 39.99, pourquoi: 'Ne pas acheter' }, { ...p0, rang: 2, titre: 'Vgate', prixVente: 39.99, pourquoi: 'Acheter si négocié · Bon rapport qualité-prix' }])
  exige(vgate[0].verdicts === "Acheter si négocié selon l'offre · Bon rapport qualité-prix", 'le plus favorable garde sa raison : ' + vgate[0].verdicts)
  exige(produitsUniques(vgate)[0].verdicts === vgate[0].verdicts, 'regrouper deux fois ne répète pas « selon l’offre »')
  const memes = produitsUniques([{ ...p0, rang: 1, titre: 'X', prixVente: 1, pourquoi: 'À surveiller' }, { ...p0, rang: 2, titre: 'X', prixVente: 2, pourquoi: 'À surveiller' }])
  exige(memes[0].verdicts === undefined, 'un même verdict reste seul')
}
{
  // Editions and hubs are dated by their own text too.
  const jour = pageJour(rapport.day, [rapport])
  fixerDatesDesPages(new Map([[`/analyses/${rapport.day}/`, new Date('2030-01-01T00:00:00Z')]]))
  const date = pageJour(rapport.day, [rapport])
  exige(date.includes('2030-01-01T00:00:00.000Z') && empreintePage(date) === empreintePage(jour), 'l’édition prend la date de son texte ; son empreinte ignore sa propre date')
  exige(sitemapXml([rapport]).includes(`/analyses/${rapport.day}/</loc><lastmod>2030-01-01T00:00:00.000Z`), 'le sitemap aussi')
  fixerDatesDesPages(new Map())
}

{
  // TOP regroupé : vrai nombre, renvois renumérotés, titre avec le nombre.
  const p0 = rapport.produits[0]
  const offres = [
    { ...p0, rang: 1, titre: 'A', prixVente: 10 }, { ...p0, rang: 2, titre: 'A', prixVente: 12 },
    { ...p0, rang: 3, titre: 'B', prixVente: 5 }, { ...p0, rang: 4, titre: 'C', prixVente: 7 },
  ]
  exige(renvoisRenumerotes('Le meilleur (n° 3), puis n°4 et le n° 2.', offres) === 'Le meilleur (n° 2), puis n° 3 et le n° 1.', 'les renvois « n° X » suivent leur produit')
  exige(renvoisRenumerotes('voir n° 3', offres.slice(2).map((p, i) => ({ ...p, rang: i + 1 }))) === 'voir n° 3', 'sans regroupement, rien ne bouge')
  const produits = produitsUniques(offres).map((p, i) => ({ ...p, rang: i + 1 }))
  const r3 = { ...rapport, produits, body: '## TOP 20 produits proposés\n| # | Produit |\n|---|---|\n| 1 | A |' }
  exige(pageRapport(r3).includes('<h2 id="produits">TOP 3 produits gagnants</h2>'), 'le h2 du TOP donne le vrai nombre')
  const long = titreRapport({ ...r3, titre: 'Maison et décoration — Bougies, senteurs et diffuseurs pour la maison' })
  exige(long.length <= TITRE_MAX && long.includes(': 3 produits ('), 'un titre long garde le nombre : ' + long)
  exige(empreintePage('<html><head><script type="application/ld+json">{"a":"39.99"}</script></head><body><p>x</p></body></html>') === empreintePage('<html><head><script type="application/ld+json">{"a":"39,99"}</script></head><body><p>x</p></body></html>'), 'l’empreinte ne porte que sur le texte rendu (#83 : JSON-LD seul changé)')
  exige(apostrophesDuTexte('appel à laction final\nCalculateur de coût déncre\nà limport') === "appel à l'action final\nCalculateur de coût d'encre\nà l'import", 'l’action, d’encre, l’import')
}

{
  const mk = (ts: string[]) => ts.map((t, i) => ({ ...rapport.produits[0], titre: t, rang: i + 1 }))
  const prods = mk(['A', 'B', 'G1', 'G1', 'G2', 'G3', 'G4', 'G4', 'G5', 'G6', 'D1', 'D2'])
  exige(renvoisRenumerotes('GL.iNet (n° 3 à 10), Deco (n° 11 et 12), n° 2 ou 4', prods) === 'GL.iNet (n° 3 à 8), Deco (n° 9 et 10), n° 2 ou 3', 'plages et listes suivent le regroupement')
  exige(renvoisRenumerotes('(n° 3 et 4)', prods) === '(n° 3)', 'deux offres devenues une ligne : un seul numéro')
  exige(parenthesesEquilibrees('Fiche /item/ vérifiée, à convertir)') === 'Fiche /item/ vérifiée, à convertir' && parenthesesEquilibrees('a (b) c') === 'a (b) c', 'une parenthèse orpheline s’en va')
  exige(JSON.stringify(produitsNettoyes(mk(['Titre', 'Casque audio Casque audio Acer GP.HDS11.02D', 'Très très bien'])).map((p) => p.titre)) === '["Casque audio Acer GP.HDS11.02D","Très très bien"]', 'casques de septembre : ni en-tête lu comme produit, ni libellé doublé')
  exige(apostrophesDuTexte("fiche à préciser à limport, l'effet `x/lannee`") === "fiche à préciser à l'import, l'effet `x/lannee`", 'aussi dans une ligne qui a déjà une apostrophe, jamais dans du code')
  exige(titreRapport({ ...rapport, titre: 'Informatique — Routeurs, Wi-Fi et réseau', produits: mk(['a', 'b']) }).endsWith(': 2 produits (' + titreRapport({ ...rapport, titre: 'x', produits: mk(['a']) }).split('(')[1]), 'une seule forme de titre, avec le nombre')
}

console.log('\nLes apostrophes perdues (gaming du 07/10)')
{
  exige(apostrophesRendues('Manettes gaming : leffet Hall, la manette de lannée') === "Manettes gaming : l'effet Hall, la manette de l'année", 'l’effet, l’année')
  exige(apostrophesRendues('Ce quon achète aujourdhui : dune autre époque, sil le faut') === "Ce qu'on achète aujourd'hui : d'une autre époque, s'il le faut", 'qu’on, aujourd’hui, d’une, s’il')
  exige(apostrophesRendues('son et lumière, la lune, le don') === 'son et lumière, la lune, le don', 'ni son, ni lune, ni don')
  exige(apostrophesRendues("Déjà lannée, l'effet") === "Déjà lannée, l'effet", 'un titre qui a déjà ses apostrophes ne bouge pas')
  exige(apostrophesDuTexte('fin dannée, près dune console, à lécran\n30 jours dessai, ce quil faut savoir avant dacheter') === "fin d'année, près d'une console, à l'écran\n30 jours d'essai, ce qu'il faut savoir avant d'acheter", 'le corps et les prompts aussi, ligne par ligne')
  exige(apostrophesDuTexte("lavoir communal\nl'effet, dannée\nhttps://x.fr/lannee") === "lavoir communal\nl'effet, d'année\nhttps://x.fr/lannee", 'ni « lavoir », ni « l\'effet » retouché, ni un lien')
  const g = { ...rapport, id: 'gaming-0710', titre: 'Manettes gaming : leffet Hall', une: null, theme: 'manettes', day: '2026-10-07' } as RapportPublic
  attribuerAdresses([g])
  const avant = cheminRapport(g)
  exige(avant.includes('leffet') && cheminRapport({ ...g, titre: apostrophesRendues(g.titre) }) === avant, 'l’adresse garde le titre brut')
}

{
  // 12/10/2026, eveil 04/10 : prix d'achat convertis, « à renégocier », texte abîmé.
  const fuite = sansMentionsPrivees("Chez Les Mômes des Dômes (tapis d'éveil « inspiration Montessori » à 85 €, cf. tableau ci-dessous), la tendance tient.\nBigjigstoys, ~58 € convertis de 49,99 £, taux indicatif.\nPrix converti de 49,99 £ (taux indicatif ≈1,16 €/£).\nProduit fort, à renégocier en gros.\nLe prix d'achat indiqué est donc un prix public observé.\nFlux via le catalogue « api » du grossiste.")
  exige(!/85 €|£|renégoc|convert|prix d'achat|« api/i.test(fuite), 'ni prix converti, ni « à renégocier », ni prix d’achat dans le corps', fuite)
  exige(!/CJ/.test(sansMentionsPrivees('Fiche confirmée. À reconfirmer dans votre compte CJ avant mise en vente.')), 'CJ en initiales : le fournisseur quand même')
  const points = pointsAnnonces("Sur l'approvisionnement, trois points de vigilance importants. Troisièmement, et c'est le point le plus sérieux : la sécurité compte.")
  exige(points === "Sur l'approvisionnement, un point de vigilance important. La sécurité compte.", 'trois points annoncés, un seul resté', points)
  exige(pointsAnnonces('Trois risques. Premièrement a. Troisièmement b.') === 'Deux risques. Premièrement a. Deuxièmement b.', 'deux restés : renumérotés')
  exige(pointsAnnonces('Depuis trois ans. Premièrement a.') === 'Depuis trois ans. Premièrement a.', 'un nombre qui n’annonce pas de points ne bouge pas')
  const rep = texteRepare('Vendus sur des plateformes低-coût, generalement entre 25 € et 70 €. Selon [Toute-la-France (Noël 2025)](https://www.toute-la-franchise.com/a-qualite) et [Fnac](https://www.fnac.com/x).')
  exige(rep === 'Vendus sur des plateformes à bas coût, généralement entre 25 € et 70 €. Selon [Toute-la-Franchise (Noël 2025)](https://www.toute-la-franchise.com/a-qualite) et [Fnac](https://www.fnac.com/x).', 'idéogrammes, accents et nom de site réparés, adresses intactes', rep)
  exige(apostrophesDuTexte('un produit daccroche au cur du marché, la mise en uvre, à limport') === "un produit d'accroche au cœur du marché, la mise en œuvre, à l'import", 'œ et apostrophes perdus')
  const casques = produitsNettoyes([{ ...rapport.produits[0], titre: 'Casque audio Casque Philips TAH4209', pourquoi: 'Bon à limport' }, { ...rapport.produits[0], titre: 'Casque audio Casque gaming' }])
  exige(casques[0].titre === 'Casque Philips TAH4209' && casques[1].titre === 'Casque gaming' && casques[0].pourquoi === "Bon à l'import", 'libellé doublé retiré, apostrophe rendue', JSON.stringify(casques.map((p) => [p.titre, p.pourquoi])))
}

{
  // 12/10/2026, constat en ligne de #86 : les anciennes études.
  const t = (x: string) => titreProduitPublic(x)
  exige(t('Ensemble table et chaises de salle à manger - AliExpress Business') === 'Ensemble table et chaises de salle à manger', 'suffixe AliExpress retiré', t('Ensemble table et chaises de salle à manger - AliExpress Business'))
  exige(t('SHEIN LUNE doudoune imprimé léopard, zip devant') === 'LUNE doudoune imprimé léopard, zip devant', 'SHEIN en tête retiré')
  exige(t('XIAOMI 17 Ultra — Sourcing alternatif Alibaba') === 'XIAOMI 17 Ultra', 'sourcing alternatif retiré')
  exige(t('Apple iPhone 15 — Reconditionne sourcing guide') === 'Apple iPhone 15 reconditionné', 'le reconditionné reste')
  exige(t('Mini-caméra DJI étanche IP68 (fiche BigBuy « Adaptateur Dji »)') === 'Mini-caméra DJI étanche IP68', 'parenthèse fournisseur retirée')
  exige(t('Claviers en gros - Grossiste et Fournisseur Dropshipping') === 'Claviers', 'page grossiste retirée')
  exige(t('Trottinette électrique 350 W') === 'Trottinette électrique 350 W', 'un titre sain ne bouge pas')
  const casques = produitsUniques(produitsNettoyes([{ ...rapport.produits[0], rang: 6, titre: 'Casque audio Philips TAK4206PK/00', prixVente: 99 }, { ...rapport.produits[0], rang: 9, titre: 'Casque Philips TAK4206PK/00', prixVente: 49 }]))
  exige(casques.length === 1, 'même code modèle : une seule ligne', JSON.stringify(casques.map((p) => p.titre)))
  exige(produitsUniques(produitsNettoyes([{ ...rapport.produits[0], titre: 'Caméra 4K/60fps A' }, { ...rapport.produits[0], titre: 'Caméra 4K/60fps B' }])).length === 2, 'une caractéristique n’est pas un code modèle')
  const jargon = sansMentionsPrivees([
    'Le quota de recherche web (WebSearch) de la session était déjà épuisé (0/200 restant) avant le début de cette recherche ; tout a donc été fait par consultation directe.',
    '*Note import : les fiches marquées `url` sont à importer à la main, lignes `extension` par l’extension.*',
    'Les champs purchase_price, estimated_landed_cost_france, marges et ROI valent donc null.',
    '- Contrefacon flagships sur canaux B2B chinois non verifies',
    '**Segmentation prix observée en direct sur AliExpress** (prix TTC = coût d’achat) :',
    '- **< 30 €** : accessoires et étuis (6,59 € à 18,49 €) — marge 54-63 %.',
    '- **290-500 €** : DJI authentiques — marge resserrée à 24-32 %.',
    '',
    '**Ce qui sature.** Les rouleaux nus se vendent à 1-3 € en magasin, avec une marge difficile à défendre. Mieux vaut les proposer en kit complet.',
    'Le marché croît de 9 %.',
  ].join('\n'))
  exige(!/quota|WebSearch|consultation directe|url|purchase|B2B|30 €|290|sature|Mieux vaut/.test(jargon) && jargon.includes('Le marché croît de 9 %.'), 'jargon interne, liste sous intro privée, orphelins', jargon)
  exige(pourquoiPublic('Bon produit d’appel, prix hors fret international, voir note') === 'Bon produit d’appel', '« voir note » vers une note disparue', pourquoiPublic('Bon produit d’appel, prix hors fret international, voir note'))
  exige(pourquoiPublic('Micro et Wi-Fi, prix non public sans compte pro, estimé') === 'Micro et Wi-Fi', 'prix non public, compte pro')
  const idees = texteRepare('- {"idea":"Landing page comparatif flagship 2026","categorie":"facile a tester"}')
  exige(idees === '- Landing page comparatif flagship 2026 (facile à tester)', 'idées de business en liste lisible', idees)
}

{
  // 12/10/2026, régressions de #87 : fourchettes lues comme une soustraction, accessoire fusionné avec l'appareil.
  const p = (x: string) => JSON.stringify(ReportQuery.plage(x))
  exige(p('29-49 €') === '{"min":29,"max":49}' && p('1 299 €') === '{"min":1299,"max":1299}' && p('12 à 15 €') === '{"min":12,"max":15}' && ReportQuery.plage('0') === null, 'fourchettes et milliers', [p('29-49 €'), p('1 299 €'), p('12 à 15 €')].join(' '))
  const negatif = produitsNettoyes([{ ...rapport.produits[0], prixVente: -10 }])
  exige(negatif[0].prixVente === null, 'aucun prix public négatif', String(negatif[0].prixVente))
  const insta = produitsUniques(produitsNettoyes([{ ...rapport.produits[0], titre: 'Insta360 X5' }, { ...rapport.produits[0], titre: 'Perche invisible pour Insta360 X5' }]))
  exige(insta.length === 2, 'un accessoire ne se fond pas dans l’appareil', JSON.stringify(insta.map((x) => x.titre)))
  exige(pourquoiPublic('WATCHLIST') === 'Liste de surveillance' || !/WATCHLIST/.test(pourquoiPublic('WATCHLIST')), 'verdict anglais traduit', pourquoiPublic('WATCHLIST'))
  exige(pourquoiPublic('-') === '', '« - » seul : cellule vide')
  const enum1 = sansMentionsPrivees('Trois règles : (1) vérifier la tension ; (2) prix d’achat 12 € chez BigBuy ; (3) tester la batterie.\nLe marché croît.')
  exige(enum1 === 'Le marché croît.', 'énumération (1)(2)(3) amputée : retirée entière', enum1)
  const jardin = sansMentionsPrivees(['**Pièges fournisseurs identifiés pendant la recherche** :', '- Chez BigBuy, les tarifs distributeur ne s’affichent qu’après connexion compte.', '- Vérifier les tensions (220-240 V constatées sur les fiches).', '- Le poids des barbecues pliants reste raisonnable.'].join('\n'))
  exige(jardin.includes('220-240 V') && !/\. : /.test(jardin), 'intro retirée : les puces restent intactes', jardin)
  const r = texteRepare('around 50 €, AUTO-SHIPPER, genériques')
  exige(r === 'environ 50 €, AutoShipper, génériques', 'corrections du texte', r)
}

{
  // 12/10/2026, constat des 88 pages : fournisseurs hors liste, prix de gros, marges, récits de blocage, rendus cassés.
  exige(pourquoiPublic('BUY NOW avec test GPU strict') === 'Acheter maintenant avec test GPU strict', 'verdict anglais composé', pourquoiPublic('BUY NOW avec test GPU strict'))
  exige(pourquoiPublic('WATCHLIST / plutôt affiliation') === 'À surveiller, plutôt affiliation', 'verdict anglais avec séparateur', pourquoiPublic('WATCHLIST / plutôt affiliation'))
  const gros = pourquoiPublic('Pro CHR, prix de gros vérifié en direct, marge élevée, format repas de fête')
  exige(gros === 'Pro CHR, format repas de fête', 'pourquoi : prix de gros et marge retirés', gros)
  const paren = pourquoiPublic('Signal fort, marge exceptionnelle, à encadrer sur l’usage légal (véhicule pro, anti-vol) pour rester conforme')
  exige(paren === 'Signal fort, à encadrer sur l’usage légal (véhicule pro, anti-vol) pour rester conforme', 'virgule entre parenthèses : le membre reste entier', paren)
  exige(pourquoiPublic('Tendance Home, lien vers la plateforme générale') === 'Tendance Home', 'pourquoi : « plateforme générale » retiré')
  const fournisseurs = sansMentionsPrivees(['Les tendances montent, qui alimentent directement notre produit Eprolo B10 Atomic.', 'Standard à confirmer directement auprès de vidaXL.', 'Les MOQ sont bas.', 'Le prix de gros est affiché.', 'Marge brute de 60 %.', 'Il faut importer en lot.', 'Le marché croît.'].join('\n'))
  exige(fournisseurs === 'Le marché croît.', 'Eprolo, « auprès de vidaXL », MOQ, prix de gros, marge brute, import en lot', fournisseurs)
  const blocage = sansMentionsPrivees('Honnêteté d’abord : la Meta Ad Library a bloqué la lecture automatisée ; aucune publicité ne peut donc être citée. La vidéo courte domine.')
  exige(blocage === 'La vidéo courte domine.', 'récit de blocage et « donc » orphelin retirés', blocage)
  const libelle = sansMentionsPrivees('Ce qui est établi par les sources : aucune publicité n’a pu être lue, la Meta Ad Library a refusé l’accès. Recommandation : tester deux visuels.')
  exige(libelle === 'Recommandation : tester deux visuels.', 'libellé sans suite retiré', libelle)
  const strates = sansMentionsPrivees(['Le marché se lit en deux strates très différentes.', '', '**Strate 1** : prix de gros chez Eprolo à 12 €.', '', '**Strate 2** : les vases design.', '', '**Strate 3** : les objets lumineux.'].join('\n'))
  exige(!/deux strates|Strate 3/.test(strates) && strates.includes('**Strate 1** : les vases design.'), 'strates : annonce retirée, renumérotées', strates)
  const gammes = sansMentionsPrivees('**Gammes de prix** : entrée 10-20 € (prix de gros 4 €) ; milieu 30-60 € (MOQ 50) ; haut 90-150 € (marge brute 60 %).\n\nLe marché croît.')
  exige(!/gros|MOQ|marge/.test(gammes) && gammes.includes('entrée 10-20 €'), 'gammes de prix sans achat', gammes)
  const puces = sansMentionsPrivees('- accessoires discrets ;\n- casques légers ;')
  exige(puces === '- Accessoires discrets.\n- Casques légers.', 'puces sans introduction : majuscule et point', puces)
  const t = texteRepare('Un smartphone complet a moins de 160EUR, droit a la reparation, il y a 3 ans, Pixel 10a. Photo lifestyle éclatante : undefined. Le reste tient.')
  exige(t === 'Un smartphone complet à moins de 160 €, droit à la réparation, il y a 3 ans, Pixel 10a. Le reste tient.', 'à, EUR, accents, phrase « undefined » retirée', t)
  exige(texteRepare('Prix | Non vérifié |') === 'Prix | — |', 'cellule « Non vérifié » : tiret')
  exige(texteRepare('Coque (手机壳 pas cher) solide') === 'Coque solide', 'parenthèse en chinois retirée entière')
  exige(texteRepare('serait faux pour un import automatisé — l’AUTO-SHIPPER ne doit pas pousser') === 'serait faux : mieux vaut ne pas pousser', 'AutoShipper reformulé')
  const prompts = promptsPublics(['"# Chargeur Portable - DIMO #"', 'Photo lifestyle : undefined.', 'Produit au centre sur fond neutre, lumière douce', 'Scène verticale d’un bureau lumineux, écran 27 pouces, plante verte, lumière du matin'].map((texte) => ({ texte })))
  exige(prompts.length === 1 && prompts[0].texte.startsWith('Scène verticale'), 'prompts : titre seul, undefined et gabarit retirés', JSON.stringify(prompts))
  exige(titreProduitPublic('Oxymètre de pouls LED portable, mention CE/ISO sur la fiche') === 'Oxymètre de pouls LED portable', 'titre : clause sur la fiche retirée')
  exige(titreProduitPublic('Chaise de table de jardin en gros - Acheter à') === 'Chaise de table de jardin', 'titre : « en gros - Acheter à » retiré')
  const page = pageRapport({ ...rapport, produits: [{ ...rapport.produits[0], prixVente: 1299 }] })
  exige(page.includes('1 299,00 €'), 'espace des milliers dans les prix')
}

{
  // 12/10/2026, constat de #90 : garde-fou fondé sur les données du rapport, pages vides, promesses, phrases bancales.
  const base = { ...rapport.produits[0], prixMin: undefined, prixMax: undefined }
  const d = donneesPrivees([
    { ...base, titre: 'Kit chimie Clementoni', fournisseur: 'Droppery', url: 'https://www.droppery.io/p/123', prixAchat: 15.43, achats: [15.43], prixVente: 26.9 },
    { ...base, titre: 'Kit ElecFreaks micro:bit', fournisseur: 'ElecFreaks', url: '', prixAchat: 49.9, achats: [49.9], prixVente: 79.9 },
    { ...base, titre: 'Vase céramique', fournisseur: 'Apple Store', url: 'https://www.apple.com/fr/', prixAchat: 1, achats: [1], prixVente: 6.9 },
  ])
  exige(porteUnAchat('Texte final : « La collection STEM · dès 15,43 € ».', d), 'prix d’achat exact dans un prompt')
  exige(porteUnAchat('Le kit électronique acheté environ 50 € chez le fournisseur.', d), 'prix d’achat à 0,50 € près (avec un mot d’achat)')
  exige(porteUnAchat('Des vases à moins de 2 € inondent le marché.', d), 'plafond sous les prix de vente : niveau d’achat')
  exige(!porteUnAchat('Un kit à 26,90 € reste accessible.', d), 'un prix de vente du rapport reste permis')
  exige(!porteUnAchat('Les parents achètent un kit à 30-80 €.', d) && !porteUnAchat('Kits entre 15 et 30 €.', d), 'une fourchette de marché n’est pas un prix d’achat')
  const noms = sansDonneesPrivees(['Sources : Copyfy.io, droppery.io et YouTube.', 'Droppery livre en 5 jours. ElecFreaks domine le codage.', '| Kit | Droppery |'].join('\n'), d)
  exige(!/droppery/i.test(noms) && noms.includes('ElecFreaks domine') && noms.includes('| — |'), 'nom et domaine du fournisseur retirés, la marque reste', noms)
  exige(!d.noms?.test('Apple Store'), 'boutique officielle d’un fabricant : la marque reste')
  const vide = { ...rapport, type: 'marketing' as const, body: '## Analyse\n\n', produits: [], prompts: [] }
  exige(corpsVisibleVide(vide) && !corpsVisibleVide(rapport), 'page sans rien à lire repérée')
  exige(sansConnecteurInitial('Plus largement, la mode reste forte.') === 'La mode reste forte.' && sansConnecteurInitial('- Mais offre une cuisson uniforme') === '- Offre une cuisson uniforme', 'connecteur en tête de bloc retiré')
  exige(sansConnecteurInitial('Budget de test conseillé. Ensuite, un test de 150 € suffit.') === 'Un test de 150 € suffit.', 'libellé nu puis « Ensuite » retirés')
  const strate = sansMentionsPrivees(['Intro saison. Le marché se lit en deux strates.', '', '**Strate 1 — vases.** Prix de gros chez Eprolo à 1 €.', '', '**Strate 2 — la saisonnalité courte.** À mettre en ligne dès maintenant.'].join('\n'))
  exige(!/deux strates|Strate/.test(strate) && strate.includes('**La saisonnalité courte.** À mettre'), 'strate restée seule : sans numéro, annonce retirée', strate)
  const t = texteRepare('## Social places\nAffiché à 1243,14 €, 1199€, entre 200 et 1000 euros ; Motorola (≈310 €, IP68, écran incurvé 14…) s’impose. Les 20 produits relevés par l’agent.')
  exige(t.includes('## Réseaux sociaux') && t.includes('1\u00a0243,14 €') && t.includes('1\u00a0199\u00a0€') && t.includes('1\u00a0000 euros') && t.includes('(≈310 €, IP68)') && t.includes('produits retenus'), 'milliers, titre en français, membre coupé, trace de collecte', t)
  const sansPrix = pageRapport({ ...rapport, accroche: '', produits: rapport.produits.map((p) => ({ ...p, prixVente: null })) })
  exige(!/avec prix de vente conseillé/.test(sansPrix), 'pas de « prix de vente conseillé » promis sans prix affichés')
  const unImage = pageRapport({ ...rapport, type: 'marketing', accroche: 'Angles et prompts publicitaires image et vidéo.', produits: [], prompts: [{ genre: 'image', format: '1:1', texte: 'Une scène lumineuse de cuisine avec le produit au premier plan et des enfants qui rient' }] })
  exige(!/image et vidéo/.test(unImage.split('</head>')[0]) && /prompts publicitaires image\./.test(unImage), 'description : seulement les prompts vraiment affichés')
  exige(!/salehoo|innovagoods|prix professionnel|compte distributeur/i.test(sansMentionsPrivees('Selon SaleHoo, octobre est creux.\nListe de surveillance : InnovaGoods.\nLe prix professionnel n’est affiché qu’après création d’un compte distributeur.\nLe marché croît.')), 'SaleHoo, InnovaGoods, prix professionnel, compte distributeur')
}

{
  // 13/10/2026, constat de #91 : un garde précis, qui coupe le morceau fautif et rien d'autre.
  const base = { ...rapport.produits[0], prixMin: undefined, prixMax: undefined }
  const d = donneesPrivees([
    { ...base, titre: 'Écran portable ZSUS 10,5"', fournisseur: 'AliExpress', url: '', prixAchat: 41, achats: [41], prixVente: 79 },
    { ...base, titre: 'Écran portable tactile 4K UPERFECT', fournisseur: 'AliExpress', url: '', prixAchat: 184, achats: [184], prixVente: 299 },
    { ...base, titre: 'Kit chimie Clementoni', fournisseur: 'Droppery', url: 'https://www.droppery.io/p/1', prixAchat: 15.43, achats: [15.43], prixVente: 26.9 },
    { ...base, titre: 'Support écran pliable', fournisseur: 'AliExpress', url: '', prixAchat: 12, achats: [12], prixVente: 30 },
  ])
  exige(!porteUnAchat('Le kit électronique vendu environ 15 €.', d) && porteUnAchat('Le kit s’achète environ 15 € chez le fournisseur.', d), 'prose : à 0,50 € près seulement avec un mot d’achat')
  exige(!porteUnAchat('Une niche SEO « meilleur support moins de 12 € ».', d) && porteUnAchat('Un kit à 15,43 € dans la vidéo.', d), 'prose : un montant rond n’est pas un prix d’achat, un montant au centime l’est')
  const cellule = sansDonneesPrivees('| 2 | Support écran pliable | Rentable à 12 € · Pliable partout · Cadeau de Noël |', d)
  exige(cellule.includes('| Pliable partout · Cadeau de Noël |') && !/12 €/.test(cellule) && sansDonneesPrivees('Un support rentable à 12 € · pliable.', d).includes('12 €'), 'cellule : le segment fautif seul, comparé à sa ligne', cellule)
  const tableau = sansDonneesPrivees('| Produit | Prix bas 15,43 € | Vente |\n|---|---|---|\n| Kit chimie Clementoni | 15,43 € | 26,90 € |', d)
  exige(tableau.startsWith('| Produit | Prix bas 15,43 € | Vente |') && tableau.includes('| — |'), 'en-tête jamais filtré, la cellule fautive devient « — »', tableau)
  const verdict = sansDonneesPrivees('Négocier : kit chimie à 15,43 € chez Droppery, livraison rapide.', d)
  exige(/^Négocier : kit chimie/.test(verdict) && !/15,43|Droppery/i.test(verdict), 'ligne de verdict : seuls le montant et le nom partent', verdict)
  const parenthese = sansDonneesPrivees('Les écrans portables USB-C (40-200 €) confirment leur statut : plusieurs références dépassent 2 000 ventes.', d)
  exige(parenthese === 'Les écrans portables USB-C confirment leur statut : plusieurs références dépassent 2 000 ventes.', 'fourchette des prix d’achat du sujet : la parenthèse part, la phrase reste', parenthese)
  exige(sansDonneesPrivees('Les écrans portables se vendent de 79 € à 299 €.', d).includes('79 € à 299 €'), 'fourchette des prix de vente : gardée')
  const liste = sansDonneesPrivees('Pack découverte — coût 15,43 €, vente 26,90 €, panier moyen élevé.', d)
  exige(liste === 'Pack découverte — vente 26,90 €, panier moyen élevé.', 'élément court d’une liste à virgules', liste)
  const lien = sansDonneesPrivees('Sources : [Droppery — kits STEM](https://www.droppery.io/kits), [YouTube](https://youtube.com/x).', d)
  exige(lien === 'Sources : [YouTube](https://youtube.com/x).', 'lien qui nomme le fournisseur : retiré entier', lien)
  exige(sansDonneesPrivees('Texte final : « La collection STEM · dès 15,43 € ».', d) === 'Texte final : « La collection STEM ».', 'prompt : le montant part, les guillemets restent')
  exige(annoncesRecomptees('Pour un revendeur, trois constats :\n- Le premier.\n- Le second.') .startsWith('Pour un revendeur, deux constats :') && annoncesRecomptees('Deux mois plus tard, la douane : plus de 1,21 million de flacons.').startsWith('Deux mois plus tard') && teteRecomptee('Trois familles se détachent', 1) === 'Une famille se détache' && teteRecomptee('Selon les deux sources', 1) === 'Selon la source' && teteRecomptee('une croissance à deux chiffres', 1) === null, 'annonce chiffrée recomptée')
  // 13/10/2026, constat de #92 : the private clause goes, not the sentence ; -2 instructions after the guard too.
  exige(sansMentionsPrivees('- Les enseignes sont des annonceurs actifs sur Meta — mention basée sur la connaissance générale du secteur.').includes('annonceurs actifs sur Meta') && !sansMentionsPrivees('- Les enseignes sont des annonceurs actifs sur Meta — mention basée sur la connaissance générale du secteur.').includes('connaissance'), 'proposition privée seule coupée')
  exige(sansMentionPrivee('Dans le détail, le baromètre SaleHoo signale une poussée de la catégorie paddle quand les maillots reculent.', estPrivee) === 'Dans le détail, le baromètre signale une poussée de la catégorie paddle quand les maillots reculent.', 'nom de source après un nom commun')
  exige(sansMentionsPrivees('- Facebook reste pertinent, période où, selon SaleHoo, la demande atteint son pic.').includes('période où la demande atteint son pic'), 'attribution « selon » retirée avec ses virgules')
  exige(sansConsignesPoste('- \u200bCanal secondaire ; x.\n- Relever les annonces actives z.\n- Facebook : ok.') === '- Facebook : ok.', 'consignes -2 masquées, espaces invisibles compris')
  exige(sansMentionsPrivees('**Segmentation prix** (prix TTC = coût d\'achat dropshipping) :\n- **< 30 €** : étuis.\nSuite.').trim() === 'Suite.', 'segmentation déclarée coût d\'achat retirée')
  exige(sansMentionsPrivees('- **Acheter maintenant** : 10 bougies chez AliExpress à 4,50 € d\'achat, avec les fiches ; 3 échantillons de lampes.') === '- **Acheter maintenant** : 3 échantillons de lampes.', 'verdict sans fragment « avec »')
  // 13/10/2026, constat de #93.
  exige(sansConsignesPoste('- Meta Ads Library : Relever les annonces actives depuis plus de 30 jours.\n- Facebook : ok.') === '- Facebook : ok.', 'consigne -2 sous une étiquette masquée')
  exige(listesEnLigne('- 1. **A** : un. 2. **B** : deux. 3. **C** : trois.') === '- 1. **A** : un.\n- 2. **B** : deux.\n- 3. **C** : trois.', 'liste numérotée sur une ligne : un point par ligne')
  exige(sansOuvertureOrpheline('- Ce qui est en revanche constaté : la demande monte.') === '- Ce qui est constaté : la demande monte.', 'contraste sans rien avant : retiré')
  exige(!/SUPER DELIVERY|marque blanche|5 000/.test(sansMentionsPrivees('- SUPER DELIVERY et Etsy ont été testés.\n- À revendre uniquement sous marque blanche.\n- Les lots y démarrent à 5 000-100 000 unités.')), 'grossiste, marque blanche, lots en milliers')
  exige(!/transforme|distingue/.test(sansMentionsPrivees("- La doudoune basique est vendue chez AliExpress à des prix proches, ce qui transforme la vente en guerre des prix.\n- Côté gamme, SaleHoo situe le prix autour de 18 $, et distingue deux segments.")), 'proposition qui s’appuie sur la partie coupée : partie avec elle')
  exige(titreProduitPublic('Smartphone générique marque blanche — 5G') === 'Smartphone générique — 5G', 'titre sans « marque blanche »')
  const vide = pageRapport({ ...rapport, type: 'marketing', body: '## Publicités en cours\n\n## Tendances du jour\nLe marché monte vite cette semaine.', produits: [], prompts: [] })
  exige(!/Publicités en cours/.test(vide) && /Tendances du jour/.test(vide), 'section vidée : cachée avec son titre')
  const consignes = texteRepare('- À relever dans TikTok Creative Center (France, 7 derniers jours).\n- Méthode : facebook.com/ads/library, pays France.\n- Canal secondaire ; visuels cadeaux et kits.\n- Prix non relevés.\n- TikTok : formats courts en tutoriel.\n| Vinted | non relevé |\nTrottinettes : Xiaomi le entry-level du marché.')
  exige(consignes.startsWith('- TikTok : formats courts') && consignes.includes('| Vinted | — |') && consignes.includes("Xiaomi, l'entrée de gamme"), 'consignes internes et fragments masqués, « non relevé » en « — »', consignes)
  exige(titreProduitPublic('Carafe à décanter Acopa 1 L') === 'Carafe à décanter 1 L' && titreProduitPublic('T-shirt brodé col rond - Printful') === 'T-shirt brodé col rond', 'marque maison de grossiste et Printful hors des titres')
  // 13/10/2026, constat de #94.
  const fournisseurs = sansPhrasesFournisseurs('**BigBuy** a été consulté en direct, rien de lisible.\nLe marché monte. Le vrai avantage de BigBuy ici reste la livraison, selon BigBuy. À l\'inverse, Eprolo et CJ Dropshipping livrent lentement. Les lits pèsent lourd.\nÉcouteurs : catégorie cadeau forte ; il faut réserver l\'approvisionnement AliExpress aux tests.\n- Pièges : (1) la CNIL ; (2) CJ Dropshipping a bloqué la recherche ; (3) les batteries.\nLes FEBEA nomme directement Temu, Shein et AliExpress comme canaux. Les salons type WebstaurantStore jouent un rôle.')
  exige(fournisseurs === 'Le marché monte. Les lits pèsent lourd.\nÉcouteurs : catégorie cadeau forte.\n- Pièges : (1) la CNIL ; (2) les batteries.\nLes FEBEA nomme directement des places de marché en ligne comme canaux. Les salons jouent un rôle.', 'phrase dont un fournisseur est le sujet, paragraphe sur les fournisseurs', fournisseurs)
  const debris = sansDebris('- Acheter maintenant : cire de soja en gros.\n- En gros, le marché monte.\n- LG C4 en rapport qualité-prix ; Sony Bravia 8 II est. Côté projecteurs, ça monte.\nLa TV devient le cadeau. Fiche prix ([lcd-compare.com](https://x)). L\'OLED reste.\n- Vendu par GL.iNet ([Amazon]).\n- ELM327 à bas.\n- Bagues : prix européens déjà proches du prix ([idealo.de](https://idealo.de)).\n- Spécialistes ; pack 6 filtres à 36,99 €.\nRentables seulement en lot ou à prix négocié (avis 3,7/5). Budget : 705 €.\n- Fiches vérifiées chez Janod et chez le fabricant français, ainsi que Pinterest.')
  exige(debris === '- Acheter maintenant : cire de soja.\n- En gros, le marché monte.\n- LG C4 en rapport qualité-prix. Côté projecteurs, ça monte.\nLa TV devient le cadeau. L\'OLED reste.\n- Vendu par GL.iNet.\n- ELM327 à bas prix.\n- Spécialistes : pack 6 filtres à 36,99 €.\nBudget : 705 €.\n- Fiches vérifiées chez Janod, ainsi que Pinterest.', 'débris laissés par le garde-fou', debris)
  const bas = prixBasSources('| Produit | Prix bas observé | Prix haut observé |\n|---|---|---|\n| Attrape-poils lot de 6 | 9,18 € | 18,67 € |\n| Apple Watch | 120 € | 250 € |\n\n- Leboncoin : entre 120 et 250 €.')
  exige(bas.includes('| Attrape-poils lot de 6 | — | 18,67 € |') && bas.includes('| Apple Watch | 120 € | 250 € |'), 'prix bas observé que la page ne montre nulle part : « — »', bas)
  exige(!/marque-blanche/.test(sujetRapport({ day: '2026-09-20', theme: 'smartphones', titre: 'Smartphones', une: null, extrait: 'Accessoires, bundles, forte marge, marque blanche, entrée de gamme' })) && /marque-blanche/.test(sujetRapport({ day: '2026-09-20', theme: 'smartphones', titre: 'Smartphones', une: null, extrait: 'Accessoires, marque blanche' }, false)), 'adresse sans terme de sourcing')
  exige(titreProduitPublic('Pompe Winuum (Acopa, lot de 4)') === 'Pompe Winuum (lot de 4)' && titreProduitPublic('Set de verres 6 pièces (lot de 8 sets)') === 'Set de verres 6 pièces' && titreProduitPublic('Paddle gonflable vidaXL, noir') === 'Paddle gonflable, noir', 'titres sans débris de grossiste ni carton')
  exige(pourquoiPublic('Marque premium, non affiché sans compte') === 'Marque premium' && pourquoiPublic('Référence confirmée au catalogue (catégorie cannes), nous ne l\'avons donc pas inventé') === '', 'pourquoi sans « sans compte » ni « au catalogue »')
  exige(titreRapport({ ...rapport, type: 'marketing', titre: 'Maison et décoration — Bougies et senteurs', day: '2026-10-12' }).endsWith(': marketing (12/10/2026)') && titreRapport({ ...rapport, type: 'marketing', titre: 'TV, son et photo — Drones', day: '2026-10-12' }) === 'TV, son et photo — Drones : marketing (12/10/2026)', 'titres marketing harmonisés')
  // 13/10/2026, constat de #98.
  const restes = sansDebris(sansPhrasesFournisseurs('Trois paliers. En entrée de gamme, l\'acier se vend entre 8 et 15 €, un terrain qui se banalise : la page [FindNiche AliExpress bijoux](https://x.y) montre des colliers à 0,99 $ — un signal de saturation.\n- Sources : [AliExpress — bras et supports](https://x.y) — Amazon.\n**Point de vigilance marque.** La fiche « GO Ultra » trouvée sur AliExpress ne correspond à rien.\n2. Les fiches "extension" doivent être recontrôlées avant toute mise en ligne : la page se construit en JavaScript et les specs sont exagérées.\nLe catalogue dropshipping ci-dessous a été constitué par consultation directe des pages catégories dashcams. Fin.\nLes parfums. 6, 9 ou 12 € pour un panier mixte (Numerama) ; identifiant.\n- Beryl AX 101,99 €, Opal 40,99 €, Mango 30,99 €, Slate 7 165,99 à 240,06 €.\n- LeDénicheur : Deco BE25 à 193,37 €, Cudy WR6500H à 116,85 €, Mesh à 49,90 €.\n- Les mini-drones, rentables seulement en lot ou à prix négocié.'))
  exige(restes === 'Trois paliers. En entrée de gamme, l\'acier se vend entre 8 et 15 €, un terrain qui se banalise — un signal de saturation.\n- Sources : [AliExpress — bras et supports](https://x.y) — Amazon.\n**Point de vigilance marque.** La fiche « GO Ultra » ne correspond à rien.\n2. Les specs sont exagérées.\nFin.\nLes parfums. Un panier mixte peut payer 6, 9 ou 12 € (Numerama) ; identifiant.\n- LeDénicheur : Deco BE25 à 193,37 €, Cudy WR6500H à 116,85 €, Mesh à 49,90 €.\n- Les mini-drones.', 'restes du constat de #98 : aparté fournisseur, outillage d\'import, sourcing, sujet du panier, prix sans vendeur, conseil en lot', restes)
  exige(sansConseilEnLot('- (3) L\'occasion DJI.\n\nRentables seulement en lot, avec un risque (3,7/5). Budget.') === '- (3) L\'occasion DJI.\n\nBudget.', 'conseil en lot coupé aussi après le découpage de la liste')
  const suite = pageRapport({ ...rapport, type: 'marketing', body: '## Publicités en cours\n- une spécialisation pointue ;\n- des arguments chiffrés ;\n- de l\'urgence.', produits: [] })
  exige(/<h2>Publicités en cours<\/h2><p>Ce qui ressort :<\/p>\s*<ul><li>une spécialisation/.test(suite), 'une liste qui continue une phrase reçoit une ouverture', /Publicités en cours[\s\S]{0,200}/.exec(suite)?.[0])
  const strate = sansMentionPrivee('**Strate 3 — la saisonnalité courte.** Les recherches [AliExpress – centre de table](https://aliexpress.com/w/x) montent. À mettre en ligne dès maintenant.', estPrivee)
  exige(strate.startsWith('**Strate 3 — la saisonnalité courte.**') && !/AliExpress/.test(strate), 'titre gras gardé entier quand la phrase qui suit est coupée', strate)
}


if (echecs) {
  console.error(`\n${echecs} attente(s) manquée(s).`)
  process.exit(1)
}
console.log('\nPages publiques des analyses : tout passe.')
