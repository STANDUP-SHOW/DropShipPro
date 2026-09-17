import fs from 'node:fs'
import path from 'node:path'
import { prisma } from './src/lib/prisma.js'
import { DROPS, BOUTIQUE_MODIFS_INCLUSES } from './src/services/tarifs.js'
import {
  executer,
  lancerCreation,
  lancerModification,
  restaurerVersion,
  travailOuvert,
  TravailRefuse,
  DELAI_TRAVAIL_MORT_MS,
  type EtatTravail,
} from './src/services/dropshopJobs.js'
import type { AppelModele } from './src/services/siteGenerator.js'

/**
 * Les travaux DropShop : ce que le vendeur paie, ce qu'il récupère, ce qui
 * lui est rendu. Vraie base, comptes jetables créés et détruits ici, FAUX
 * modèle (il rend le squelette de référence, ou des éditions, ou une page
 * cassée selon le cas), VRAI vérificateur en processus enfant.
 *
 *   cd backend && npx tsx check-dropshop-jobs.ts
 *
 * Attentes, chacune contre une panne qui coûterait de l'argent :
 * - la création débite 200 tout ou rien, publie la version 1, ouvre 10 modifs ;
 * - sans drops : 402, rien n'est écrit ;
 * - une modification comprise ne coûte rien et décompte ; la 11e coûte 10 ;
 * - un modèle qui rend une page cassée deux fois de suite : échec, drops rendus ;
 * - un modèle qui lève : échec, drops rendus, le travail suivant peut partir ;
 * - un travail mort (serveur redémarré) est clos et rendu à la lecture suivante ;
 * - la restauration remet la page exacte, en version neuve, sans rien débiter.
 */

const EXEMPLE = fs.readFileSync(path.join('dropshop', 'exemple.html'), 'utf8')

let echecs = 0
function attendre(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const rendLeSquelette: AppelModele = async () => ({ texte: '```html\n' + EXEMPLE + '\n```', entree: 10, sortie: 20 })
const rendUneEdition: AppelModele = async (d) => {
  if (/Page actuelle/.test(d.messages[0].content)) {
    // Le faux fait comme le vrai : il recopie l'extrait tel qu'il est dans la
    // page reçue, sinon sa seconde édition chercherait un titre déjà changé.
    const titre = /<title>[^<]*<\/title>/.exec(d.messages[0].content)?.[0] ?? '<title>Boutique</title>'
    return { texte: '```json\n' + JSON.stringify({ resume: 'Titre changé.', edits: [{ chercher: titre, remplacer: '<title>Boutique modifiée</title>' }] }) + '\n```', entree: 10, sortie: 5 }
  }
  return rendLeSquelette(d)
}
const rendCasse: AppelModele = async (d) => {
  if (/Page actuelle/.test(d.messages[0].content)) {
    // La « réparation » ne répare rien : elle rend une édition sans effet.
    return { texte: '```json\n' + JSON.stringify({ resume: 'rien', edits: [{ chercher: '<title>Boutique</title>', remplacer: '<title>Boutique</title>' }] }) + '\n```', entree: 1, sortie: 1 }
  }
  return { texte: '```html\n' + EXEMPLE.replace('<form data-commande>', '<form>') + '\n```', entree: 10, sortie: 20 }
}
const leve: AppelModele = async () => { throw new Error('modèle injoignable') }

async function solde(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } })).credits
}

async function main() {
  const t = Date.now()
  const riche = await prisma.user.create({ data: { email: `banc-dropshop-${t}@example.com`, passwordHash: 'x', credits: 1000 } })
  const pauvre = await prisma.user.create({ data: { email: `banc-dropshop-pauvre-${t}@example.com`, passwordHash: 'x', credits: 50 } })
  const tous = [riche.id, pauvre.id]
  try {
    const shop = await prisma.shop.create({ data: { userId: riche.id, name: 'Banc DropShop', platform: 'dropshipper', slug: `banc-dropshop-${t}` } })
    const shopPauvre = await prisma.shop.create({ data: { userId: pauvre.id, name: 'Banc pauvre', platform: 'dropshipper', slug: `banc-pauvre-${t}` } })

    console.log('— Création —')
    let etat = await lancerCreation(shop, 'Une boutique de montres élégantes et d\'écouteurs, ambiance atelier horloger.', { appeler: rendLeSquelette })
    attendre('le prix est pris à la commande, tout ou rien', (await solde(riche.id)) === 1000 - DROPS.boutiqueCreation)
    attendre('le travail est visible en cours', (await travailOuvert({ ...shop, siteJob: etat as never }))?.etape !== undefined)
    // On attend la fin du travail lancé en arrière-plan.
    await attendreFin(shop.id)
    let s = await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })
    const j = s.siteJob as unknown as EtatTravail
    attendre('la boutique est publiée en version 1', s.siteVersion === 1 && Boolean(s.siteHtml) && s.siteHtml === EXEMPLE, j.erreur ?? '')
    attendre('le brief est gardé et 10 modifications sont ouvertes', s.siteBrief?.includes('horloger') === true && s.siteModifsRestantes === BOUTIQUE_MODIFS_INCLUSES)
    attendre('la version 1 est archivée avec sa demande', (await prisma.siteVersion.count({ where: { shopId: shop.id, numero: 1 } })) === 1)
    attendre('le travail est clos « terminé »', j.etape === 'termine' && Boolean(j.fin))

    console.log('\n— Sans drops —')
    let refus: TravailRefuse | null = null
    try { await lancerCreation(shopPauvre, 'Une boutique de bougies parfumées faites main.', { appeler: rendLeSquelette }) } catch (e) { refus = e as TravailRefuse }
    attendre('402 et rien n\'est écrit', refus?.status === 402 && (await solde(pauvre.id)) === 50 && !(await prisma.shop.findUniqueOrThrow({ where: { id: shopPauvre.id } })).siteHtml)

    console.log('\n— Modifications —')
    s = await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })
    await lancerModification(s, 'Change le titre de l\'onglet.', { appeler: rendUneEdition })
    await attendreFin(shop.id)
    s = await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })
    attendre('une modification comprise ne coûte rien et décompte', (await solde(riche.id)) === 1000 - DROPS.boutiqueCreation && s.siteModifsRestantes === BOUTIQUE_MODIFS_INCLUSES - 1)
    attendre('la page est éditée, version 2', s.siteVersion === 2 && s.siteHtml?.includes('<title>Boutique modifiée</title>') === true)
    attendre('le résumé du modèle est montré au vendeur', (s.siteJob as unknown as EtatTravail).resume === 'Titre changé.')

    await prisma.shop.update({ where: { id: shop.id }, data: { siteModifsRestantes: 0 } })
    s = await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })
    await lancerModification(s, 'Encore le titre.', { appeler: rendUneEdition })
    await attendreFin(shop.id)
    attendre('au-delà des comprises, une modification coûte 10', (await solde(riche.id)) === 1000 - DROPS.boutiqueCreation - DROPS.boutiqueModification)

    console.log('\n— Échecs rendus —')
    const avant = await solde(riche.id)
    s = await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })
    await lancerModification(s, 'Casse tout.', { appeler: leve })
    await attendreFin(shop.id)
    s = await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })
    const je = s.siteJob as unknown as EtatTravail
    attendre('un modèle qui lève : échec, drops rendus, page intacte', je.etape === 'echec' && (await solde(riche.id)) === avant && s.siteVersion === 3, je.erreur)

    const shop2 = await prisma.shop.create({ data: { userId: riche.id, name: 'Banc cassé', platform: 'dropshipper', slug: `banc-casse-${t}` } })
    const avant2 = await solde(riche.id)
    await lancerCreation(shop2, 'Une boutique qui ne passera jamais le contrôle du visiteur.', { appeler: rendCasse })
    await attendreFin(shop2.id)
    const s2 = await prisma.shop.findUniqueOrThrow({ where: { id: shop2.id } })
    const j2 = s2.siteJob as unknown as EtatTravail
    attendre('une page cassée deux fois : échec nommé, drops rendus, rien publié', j2.etape === 'echec' && (j2.echecs?.some((e) => /data-commande/.test(e)) ?? false) && (await solde(riche.id)) === avant2 && !s2.siteHtml, j2.erreur)

    console.log('\n— Travail mort —')
    const mort: EtatTravail = { type: 'modification', etape: 'ecriture', tentative: 1, demande: 'x', debut: new Date(Date.now() - DELAI_TRAVAIL_MORT_MS - 1000).toISOString(), drops: 10 }
    await prisma.shop.update({ where: { id: shop.id }, data: { siteJob: mort as never } })
    const avant3 = await solde(riche.id)
    const ouvert = await travailOuvert(await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } }))
    attendre('un travail sans fin depuis 15 min est clos et ses drops rendus', ouvert === null && (await solde(riche.id)) === avant3 + 10)

    console.log('\n— Restauration —')
    s = await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })
    const avant4 = await solde(riche.id)
    const v = await restaurerVersion(s, 1)
    s = await prisma.shop.findUniqueOrThrow({ where: { id: shop.id } })
    attendre('la version 1 est remise telle quelle, en version neuve, sans débit', v === 4 && s.siteVersion === 4 && s.siteHtml === EXEMPLE && (await solde(riche.id)) === avant4)
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: tous } } })
    await prisma.$disconnect()
  }
  console.log(echecs ? `\n${echecs} attente(s) non tenue(s).` : '\nTravaux DropShop : tout passe.')
  process.exit(echecs ? 1 : 0)
}

/** Attend que le travail de la boutique soit clos (fin posée), 60 s au plus. */
async function attendreFin(shopId: string) {
  const debut = Date.now()
  while (Date.now() - debut < 60_000) {
    const s = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { siteJob: true } })
    const j = s.siteJob as unknown as EtatTravail | null
    if (j && j.fin) return
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error('le travail ne finit pas')
}

void executer
main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
