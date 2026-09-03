import { readFileSync } from 'node:fs'
import { CANAUX } from './src/services/channelDirectory.js'
import { canauxAFlux, fluxPour, FORMATS_FLUX } from './src/services/channelFeeds.js'

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
  const attendues = ['facebook', 'instagram', 'google', 'pinterest']
  const inattendues = marketplacesServies.filter((c) => !attendues.includes(c.id))

  verifier(
    'aucune place de marché ne se dit servie par un flux, sauf les boutiques sociales',
    inattendues.length === 0,
    inattendues.length ? inattendues.map((c) => c.label).join(', ') : 'les exceptions sont vérifiées une par une',
  )
  verifier(
    'les outils ne sont jamais des destinations',
    CANAUX.filter((c) => c.type === 'outil').every((c) => fluxPour(c) === null),
  )
  verifier(
    'les régies publicitaires non plus',
    CANAUX.filter((c) => c.type === 'regie' && !attendues.includes(c.id)).every((c) => fluxPour(c) === null),
    'une régie se branche par la passerelle sociale, pas par un catalogue',
  )
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
  verifier(
    'et il remonte au-dessus de ce qui n’est pas branché',
    /Number\(Boolean\(b\.flux\)\) - Number\(Boolean\(a\.flux\)\)/.test(ecran),
  )
}

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
