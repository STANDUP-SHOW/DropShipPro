/**
 * Banc : la file de publication de l'application desktop (routes/agent.ts,
 * GET /publications et POST /publications/:id/resultat), sur des comptes
 * JETABLES créés et détruits ici.
 *
 * Ce qu'il vérifie : seules les publications PENDING des places de marché à
 * session sortent, celles du compte de la clé seulement ; le résultat ne touche
 * qu'une publication PENDING de ce compte ; un autre compte ne peut rien voir ni
 * modifier ; une clé révoquée ne passe pas.
 */
import express from 'express'
import type { AddressInfo } from 'node:net'
import { prisma } from './src/lib/prisma.js'
import { agentRouter } from './src/routes/agent.js'
import { generateApiKey } from './src/middleware/apiKey.js'

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail && !condition ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

async function main() {
  const marque = `banc-agent-pub-${Date.now()}`
  const user = await prisma.user.create({ data: { email: `${marque}@exemple.test`, passwordHash: 'x', credits: 0 } })
  const autre = await prisma.user.create({ data: { email: `${marque}-autre@exemple.test`, passwordHash: 'x', credits: 0 } })
  const cle = generateApiKey()
  const cleAutre = generateApiKey()
  const cleRevoquee = generateApiKey()
  await prisma.apiKey.create({ data: { userId: user.id, name: 'banc', keyHash: cle.keyHash, prefix: cle.prefix } })
  await prisma.apiKey.create({ data: { userId: autre.id, name: 'banc autre', keyHash: cleAutre.keyHash, prefix: cleAutre.prefix } })
  await prisma.apiKey.create({ data: { userId: user.id, name: 'revoquee', keyHash: cleRevoquee.keyHash, prefix: cleRevoquee.prefix, revokedAt: new Date() } })

  const app = express()
  app.use(express.json())
  app.use('/api/agent', agentRouter)
  const serveur = app.listen(0, '127.0.0.1')
  await new Promise((r) => serveur.once('listening', r))
  const base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api/agent`
  const appel = async (methode: string, chemin: string, k: string, corps?: unknown) => {
    const r = await fetch(base + chemin, {
      method: methode,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${k}` },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    })
    return { statut: r.status, json: (await r.json().catch(() => ({}))) as Record<string, any> }
  }

  try {
    const base_ = { userId: user.id, sourceUrl: 'https://exemple.test/p', images: ['https://exemple.test/a.jpg'], price: 10, sellingPrice: 30, imagesWatermarked: true }
    const lampe = await prisma.product.create({ data: { ...base_, title: 'Lampe de bureau', description: 'Une lampe.', condition: 'reconditionne' } })
    const tapis = await prisma.product.create({ data: { ...base_, title: 'Tapis', description: 'Un tapis.' } })
    const chezAutre = await prisma.product.create({ data: { ...base_, userId: autre.id, title: 'Chez un autre', description: 'x' } })

    const pVinted = await prisma.publication.create({ data: { productId: lampe.id, platform: 'VINTED', status: 'PENDING', targetCategory: 'Maison > Luminaires' } })
    const pLbc = await prisma.publication.create({ data: { productId: tapis.id, platform: 'LEBONCOIN', status: 'PENDING' } })
    await prisma.publication.create({ data: { productId: lampe.id, platform: 'EBAY', status: 'PENDING' } })
    await prisma.publication.create({ data: { productId: tapis.id, platform: 'VINTED', status: 'PUBLISHED' } })
    await prisma.publication.create({ data: { productId: chezAutre.id, platform: 'VINTED', status: 'PENDING' } })

    console.log('Lecture de la file')
    const r = await appel('GET', '/publications', cle.key)
    const ids = (r.json.publications ?? []).map((p: { id: string }) => p.id).sort()
    verifier('seules les PENDING des places à session du compte sortent (2 sur 5)', r.statut === 200 && ids.length === 2 && ids.join() === [pVinted.id, pLbc.id].sort().join(), JSON.stringify(r.json).slice(0, 200))
    const v = (r.json.publications ?? []).find((p: { id: string }) => p.id === pVinted.id)
    verifier('la fiche porte titre, prix, photos, catégorie', v?.title === 'Lampe de bureau' && v.price === 30 && v.images.length === 1 && v.category === 'Maison > Luminaires')
    verifier('l’état est traduit pour la plateforme (reconditionné → « Très bon état » sur Vinted)', v?.condition === 'Très bon état', String(v?.condition))
    const filtre = await appel('GET', '/publications?platform=leboncoin', cle.key)
    verifier('filtre par plateforme', filtre.json.count === 1 && filtre.json.publications[0].id === pLbc.id)
    const autreVue = await appel('GET', '/publications', cleAutre.key)
    verifier('un autre compte ne voit que les siennes', autreVue.json.count === 1 && autreVue.json.publications[0].title === 'Chez un autre')
    verifier('clé révoquée : 401', (await appel('GET', '/publications', cleRevoquee.key)).statut === 401)

    console.log('\nClé desktop : import et mise en file')
    const cleDesk = generateApiKey('desktop')
    await prisma.apiKey.create({ data: { userId: user.id, name: 'desktop', keyHash: cleDesk.keyHash, prefix: cleDesk.prefix } })
    verifier('la clé desktop a son préfixe reconnaissable', cleDesk.key.startsWith('dsp_desk_') && cle.key.startsWith('dsp_live_'))
    verifier('une clé d’agent tiers ne peut PAS importer (403)', (await appel('POST', '/import', cle.key, { url: 'https://exemple.test/p' })).statut === 403)
    verifier('… ni mettre en file de publication (403)', (await appel('POST', '/publications', cle.key, { productId: lampe.id, platforms: ['VINTED'] })).statut === 403)
    verifier('import : URL invalide refusée (400) avant tout débit', (await appel('POST', '/import', cleDesk.key, { url: 'pas une adresse' })).statut === 400)
    const soldeAvant = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).credits
    const sansSolde = await appel('POST', '/import', cleDesk.key, { url: 'https://exemple.test/produit' })
    verifier('import sans solde : 402 « drops », rien n’est débité', sansSolde.statut === 402 && (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).credits === soldeAvant, JSON.stringify(sansSolde.json))

    const tapisFile = await prisma.product.create({ data: { ...base_, title: 'Plaid', description: 'Un plaid.' } })
    const mise = await appel('POST', '/publications', cleDesk.key, { productId: tapisFile.id, platforms: ['VINTED', 'FACEBOOK'] })
    const enFile = await prisma.publication.findMany({ where: { productId: tapisFile.id } })
    verifier('mise en file : deux publications PENDING créées', mise.statut === 201 && enFile.length === 2 && enFile.every((x) => x.status === 'PENDING'), JSON.stringify(mise.json))
    const encore = await appel('POST', '/publications', cleDesk.key, { productId: tapisFile.id, platforms: ['VINTED'] })
    verifier('déjà en file : pas de doublon', encore.json.enFile.length === 0 && (await prisma.publication.count({ where: { productId: tapisFile.id } })) === 2)
    verifier('produit d’un autre compte : 404', (await appel('POST', '/publications', cleDesk.key, { productId: chezAutre.id, platforms: ['VINTED'] })).statut === 404)
    verifier('plateforme hors session refusée (400)', (await appel('POST', '/publications', cleDesk.key, { productId: tapisFile.id, platforms: ['EBAY'] })).statut === 400)
    const vue = await appel('GET', '/publications?platform=facebook', cleDesk.key)
    verifier('la file rend l’annonce à la clé desktop', vue.json.publications.some((x: { productId: string }) => x.productId === tapisFile.id))
    await appel('POST', `/publications/${enFile.find((x) => x.platform === 'FACEBOOK')!.id}/resultat`, cleDesk.key, { status: 'FAILED', error: 'essai' })
    const relance = await appel('POST', '/publications', cleDesk.key, { productId: tapisFile.id, platforms: ['FACEBOOK'] })
    verifier('une publication FAILED peut être remise en file', relance.json.enFile?.[0] === 'FACEBOOK')
    await prisma.publication.updateMany({ where: { productId: tapisFile.id }, data: { status: 'PUBLISHED' } })

    console.log('\nRéseaux sociaux')
    verifier('une clé d’agent tiers ne publie pas sur les réseaux (403)', (await appel('POST', '/social', cle.key, { productId: lampe.id })).statut === 403)
    verifier('corps invalide : 400', (await appel('POST', '/social', cleDesk.key, {})).statut === 400)
    verifier('produit d’un autre compte : 404', (await appel('POST', '/social', cleDesk.key, { productId: chezAutre.id })).statut === 404)
    const soc = await appel('POST', '/social', cleDesk.key, { productId: lampe.id })
    verifier('aucun réseau relié (ou module inactif) : 200, rien publié, la raison est dite', soc.statut === 200 && soc.json.publies === 0 && /activé|relié/.test(String(soc.json.raison)), JSON.stringify(soc.json))

    console.log('\nPilote automatique → file du desktop')
    const { mettreEnFileDesktop, aUneApplicationDesktop } = await import('./src/services/desktopFile.js')
    const gagnant = await prisma.product.create({ data: { ...base_, title: 'Gagnant du pilote', description: 'x' } })
    await prisma.apiKey.updateMany({ where: { keyHash: cleDesk.keyHash }, data: { lastUsedAt: null } })
    verifier('clé desktop jamais utilisée : pas d’application desktop, rien mis en file', !(await aUneApplicationDesktop(user.id)) && (await mettreEnFileDesktop(user.id, gagnant.id)).length === 0)
    await prisma.apiKey.updateMany({ where: { keyHash: cleDesk.keyHash }, data: { lastUsedAt: new Date() } })
    verifier('clé desktop vue à l’instant : l’application existe', await aUneApplicationDesktop(user.id))
    const faites = await mettreEnFileDesktop(user.id, gagnant.id)
    verifier('le produit gagnant est mis en file sur les trois plateformes à session', faites.length === 3 && (await prisma.publication.count({ where: { productId: gagnant.id, status: 'PENDING' } })) === 3)
    verifier('rejoué : aucun doublon', (await mettreEnFileDesktop(user.id, gagnant.id)).length === 0)
    await prisma.apiKey.updateMany({ where: { keyHash: cleDesk.keyHash }, data: { lastUsedAt: new Date(Date.now() - 8 * 24 * 3600_000) } })
    verifier('application muette depuis 8 jours : plus de mise en file', !(await aUneApplicationDesktop(user.id)))
    await prisma.apiKey.updateMany({ where: { keyHash: cleDesk.keyHash }, data: { lastUsedAt: new Date(), revokedAt: new Date() } })
    verifier('clé révoquée : plus de mise en file', !(await aUneApplicationDesktop(user.id)))
    await prisma.publication.deleteMany({ where: { productId: gagnant.id } })

    console.log('\nListe du jour des gagnants')
    const existant = await prisma.marketReport.findFirst({ orderBy: { day: 'desc' }, select: { day: true } })
    const jourBanc = existant?.day ?? new Date().toISOString().slice(0, 10)
    const catBanc = `banc-${Date.now()}` // une catégorie inconnue du site : invisible pour les vendeurs, supprimée plus bas
    const sku = Date.now()
    await prisma.marketReport.create({
      data: {
        day: jourBanc, categorie: catBanc, theme: 't', type: 'rayon', titre: 'banc', body: 'banc', sources: 0,
        produits: [
          { rang: 1, titre: 'Marge haute', fournisseur: 'x', url: `https://exemple.test/a-${sku}`, margePct: 55, import: 'url' },
          { rang: 2, titre: 'Marge basse', fournisseur: 'x', url: `https://exemple.test/b-${sku}`, margePct: 8, import: 'url' },
          { rang: 3, titre: 'Extension requise', fournisseur: 'temu', url: `https://www.temu.com/c-${sku}`, margePct: 70, import: 'extension' },
          { rang: 4, titre: 'Marge inconnue', fournisseur: 'x', url: `https://exemple.test/d-${sku}`, margePct: null, import: 'url' },
          { rang: 5, titre: 'Déjà importé', fournisseur: 'x', url: `https://exemple.test/e-${sku}`, margePct: 40, import: 'api' },
          { rang: 6, titre: 'Marge moyenne', fournisseur: 'x', url: `https://exemple.test/f-${sku}`, margePct: 30, import: 'api' },
          { rang: 7, titre: 'Adresse invalide', fournisseur: 'x', url: 'pas-une-adresse', margePct: 90, import: 'url' },
        ],
      },
    })
    await prisma.product.create({ data: { ...base_, title: 'Déjà chez moi', description: 'x', sourceUrl: `https://exemple.test/e-${sku}` } })
    await prisma.user.update({ where: { id: user.id }, data: { credits: 100 } })
    await prisma.apiKey.updateMany({ where: { keyHash: cleDesk.keyHash }, data: { revokedAt: null } })
    const pauvre = await appel('GET', '/gagnants', cleDesk.key)
    verifier('moins de 500 drops : 402 avec le manque chiffré, comme Fresh news', pauvre.statut === 402 && pauvre.json.seuil === 500 && pauvre.json.drops === 100)
    await prisma.user.update({ where: { id: user.id }, data: { credits: 800 } })
    verifier('une clé d’agent tiers ne lit pas la liste (403)', (await appel('GET', '/gagnants', cle.key)).statut === 403)
    const g = await appel('GET', '/gagnants', cleDesk.key)
    const miens = (g.json.produits ?? []).filter((p: { categorie: string }) => p.categorie === catBanc)
    verifier('marge ≥ 20 % seulement, triée par marge : 55 % puis 30 %', miens.map((p: { margePct: number }) => p.margePct).join() === '55,30', JSON.stringify(miens))
    verifier('extension, marge inconnue, déjà importé et adresse invalide sont écartés', !miens.some((p: { url: string }) => /temu|d-|e-|pas-une/.test(p.url)) && g.json.ecartes.extension >= 1 && g.json.ecartes.margeInconnue >= 1 && g.json.ecartes.dejaImportes >= 1)
    const serre = await appel('GET', '/gagnants?margeMin=50&max=1', cleDesk.key)
    verifier('margeMin et max respectés', serre.json.produits.length <= 1 && serre.json.produits.every((p: { margePct: number }) => p.margePct >= 50))
    verifier('paramètre invalide : 400', (await appel('GET', '/gagnants?max=99999', cleDesk.key)).statut === 400)
    await prisma.marketReport.deleteMany({ where: { categorie: catBanc } })

    console.log('\nRésultat')
    verifier('résultat invalide refusé (400)', (await appel('POST', `/publications/${pVinted.id}/resultat`, cle.key, { status: 'DONE' })).statut === 400)
    const intrus = await appel('POST', `/publications/${pVinted.id}/resultat`, cleAutre.key, { status: 'PUBLISHED' })
    verifier('un autre compte ne peut pas clore la publication (404)', intrus.statut === 404 && (await prisma.publication.findUniqueOrThrow({ where: { id: pVinted.id } })).status === 'PENDING')
    const ok = await appel('POST', `/publications/${pVinted.id}/resultat`, cle.key, { status: 'PUBLISHED', externalUrl: 'https://www.vinted.fr/items/123-lampe' })
    const apres = await prisma.publication.findUniqueOrThrow({ where: { id: pVinted.id } })
    verifier('publiée : statut, adresse et date écrits', ok.statut === 200 && apres.status === 'PUBLISHED' && apres.externalUrl === 'https://www.vinted.fr/items/123-lampe' && !!apres.publishedAt)
    verifier('déjà traitée : refusée, pas rejouée (404)', (await appel('POST', `/publications/${pVinted.id}/resultat`, cle.key, { status: 'FAILED' })).statut === 404)
    const echec = await appel('POST', `/publications/${pLbc.id}/resultat`, cle.key, { status: 'FAILED', error: 'Captcha vu' })
    const apresEchec = await prisma.publication.findUniqueOrThrow({ where: { id: pLbc.id } })
    verifier('échec : statut FAILED et raison écrite', echec.statut === 200 && apresEchec.status === 'FAILED' && apresEchec.error === 'Captcha vu')
    const ebay = await prisma.publication.findFirstOrThrow({ where: { productId: lampe.id, platform: 'EBAY' } })
    verifier('une publication hors places à session est refusée (404)', (await appel('POST', `/publications/${ebay.id}/resultat`, cle.key, { status: 'PUBLISHED' })).statut === 404)
    verifier('la file ne rend plus les traitées', (await appel('GET', '/publications', cle.key)).json.count === 0)
  } finally {
    serveur.close()
    await prisma.publication.deleteMany({ where: { product: { userId: { in: [user.id, autre.id] } } } })
    await prisma.product.deleteMany({ where: { userId: { in: [user.id, autre.id] } } })
    await prisma.apiKey.deleteMany({ where: { userId: { in: [user.id, autre.id] } } })
    await prisma.user.deleteMany({ where: { id: { in: [user.id, autre.id] } } })
    await prisma.$disconnect()
  }

  if (echecs) {
    console.error(`\n${echecs} attente(s) manquée(s).`)
    process.exitCode = 1
    return
  }
  console.log('\nFile de publication desktop : tout passe.')
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exitCode = 1
})
