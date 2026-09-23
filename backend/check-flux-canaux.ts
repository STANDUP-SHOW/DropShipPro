import { readFileSync } from 'node:fs'
import { CANAUX } from './src/services/channelDirectory.js'
import { canauxAFlux, fluxPour, FORMATS_FLUX, IDS_EXCEPTIONS_FLUX } from './src/services/channelFeeds.js'

/**
 * Ce qu'un simple flux produit suffit à nourrir.
 *
 *   cd backend && npx tsx check-flux-canaux.ts
 *
 * **Le raisonnement, posé le 03/09/2026.** Le vendeur voyait 314 marques dans
 * l'annuaire et en déduisait 314 chantiers. C'est vrai pour les places de
 * marché — une journée et demie chacune avant même le connecteur — et faux
 * pour les comparateurs et l'affiliation : ceux-là ne veulent pas d'API, ils
 * veulent une adresse à relire chaque nuit. Nous servons déjà les deux formats
 * qu'ils attendent.
 *
 * Ce banc tient la promesse dans les deux sens. Il vérifie qu'aucune place de
 * marché ne se retrouve marquée « servie par votre flux » — ce serait mentir
 * au vendeur, qui collerait une adresse là où il faut un compte et un
 * connecteur — et que les familles qui vivent d'un flux le sont toutes.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

console.log("\nCe que le flux suffit à servir")
{
  const servis = canauxAFlux()
  const comparateurs = CANAUX.filter((c) => c.type === 'comparateur')
  const affiliation = CANAUX.filter((c) => c.type === 'affiliation')

  verifier(
    'tous les comparateurs sont servis par le flux',
    comparateurs.every((c) => fluxPour(c) !== null),
    `${comparateurs.length} comparateur(s)`,
  )
  verifier(
    "toutes les plateformes d'affiliation aussi",
    affiliation.every((c) => fluxPour(c) !== null),
    `${affiliation.length} plateforme(s)`,
  )
  verifier(
    'le compte annoncé au vendeur est celui-là',
    servis.length >= comparateurs.length + affiliation.length,
    `${servis.length} canaux servis par un flux`,
  )
}

// --- La promesse dans l'autre sens ------------------------------------------
console.log("\nCe qu'on ne doit surtout pas annoncer")
{
  /*
   * Une place de marché marquée « servie par votre flux » ferait coller une
   * adresse là où il faut un compte vendeur et un connecteur. Le vendeur
   * attendrait des ventes qui ne viendraient jamais, sans rien pour le lui
   * dire — exactement le défaut qu'on corrige partout ailleurs.
   */
  const marketplacesServies = CANAUX.filter((c) => c.type === 'marketplace' && fluxPour(c) !== null)
  verifier(
    'aucune place de marché ne se dit servie par un flux',
    marketplacesServies.length === 0,
    marketplacesServies.length
      ? marketplacesServies.map((c) => c.label).join(', ')
      : 'un dépôt annonce par annonce ne se remplace pas par une adresse',
  )
  verifier(
    'les outils ne sont jamais des destinations',
    CANAUX.filter((c) => c.type === 'outil').every((c) => fluxPour(c) === null),
  )

  /*
   * **La leçon de ce banc, apprise le 03/09/2026.** La première version des
   * exceptions portait des identifiants plausibles — `facebook`, `google-ads`,
   * `meta-ads` — qu'aucune carte de l'annuaire ne porte. Et ce banc vérifiait
   * la même liste : code et banc partageaient la constante fausse, donc tout
   * passait pendant que l'écran disait « pas encore reliée » sur Facebook Ads
   * et Google Shopping Ads. Chaque clé est désormais confrontée à l'annuaire,
   * la seule source qui ne peut pas se tromper sur ses propres identifiants.
   */
  const idsAnnuaire = new Set(CANAUX.map((c) => c.id))
  const fantomes = IDS_EXCEPTIONS_FLUX.filter((id) => !idsAnnuaire.has(id))
  verifier(
    "chaque exception de flux existe dans l'annuaire",
    fantomes.length === 0,
    fantomes.length ? `identifiants fantômes : ${fantomes.join(', ')}` : `${IDS_EXCEPTIONS_FLUX.length} exceptions, toutes réelles`,
  )

  /*
   * Les régies sont une famille à flux depuis le 23/09/2026 : une publicité
   * dynamique pioche dans un catalogue, c'est structurel (Criteo, AdRoll, Bing
   * Product Ads, Google Local lisent tous un flux). Les exceptions vérifiées
   * gardent leur format (Meta en CSV), les autres reçoivent Google Shopping.
   */
  const regies = CANAUX.filter((c) => c.type === 'regie')
  verifier('toute régie est servie par un flux', regies.every((c) => fluxPour(c) !== null), regies.filter((c) => !fluxPour(c)).map((c) => c.label).join(', '))
  const metaEnCsv = ['instagram', 'facebookads', 'snapchat'].every((id) => fluxPour(CANAUX.find((c) => c.id === id)!)?.format === 'meta')
  verifier('les régies de la famille Meta gardent le CSV Meta', metaEnCsv)
  verifier('une régie hors exception reçoit Google Shopping', fluxPour(CANAUX.find((c) => c.id === 'criteo')!)?.format === 'google')
}

// --- Les deux formats existent vraiment --------------------------------------
console.log('\nLes deux formats servis')
{
  const routes = readFileSync('src/routes/public.ts', 'utf8')
  for (const f of FORMATS_FLUX) {
    verifier(
      `${f.label} : la route existe`,
      routes.includes(`/shops/:shopKey/${f.fichier}`),
      f.fichier,
    )
  }
  verifier('deux formats, pas plus', FORMATS_FLUX.length === 2)
  verifier(
    'le format Google est du RSS avec l’espace de noms g:',
    /base\.google\.com\/ns\/1\.0/.test(readFileSync('src/services/productFeeds.ts', 'utf8').concat(routes)),
  )
}

// --- Ce que l'écran en fait ---------------------------------------------------
console.log("\nCe que le vendeur voit")
{
  const ecran = readFileSync('../frontend/src/components/ChannelDirectory.tsx', 'utf8')
  verifier("l'adresse du flux est copiable", /navigator\.clipboard\.writeText\(adresse\)/.test(ecran))
  verifier(
    'un canal servi par flux porte sa propre pastille',
    /par votre flux/.test(ecran),
    'ni « reliée » ni « pas encore reliée » : c’est un troisième état',
  )
  // Le tri par voie (23/09/2026) : branchées, compte requis, flux et fichier,
  // extension, puis ce qui n'est pas un canal de vente.
  verifier(
    'et il remonte au-dessus de ce qui n’est pas branché',
    /function rang\(c: Canal\)/.test(ecran) && /l\.voie === 'flux' \|\| l\.voie === 'export'\) return 2/.test(ecran) && /return 4/.test(ecran),
  )
  verifier("les cinq voies ont leur pastille", ['reliée', 'votre compte vendeur', 'par votre flux', "par l'extension", 'pas un canal de vente'].every((t) => ecran.includes(t)))
}

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
