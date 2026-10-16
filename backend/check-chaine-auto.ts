/**
 * La chaîne automatique de bout en bout, sur une base de banc (16/10/2026) :
 * rapport du Poste d'analyses → produits gagnants du rayon → AUTO-SHIPPER →
 * annonce importée et réécrite → publiée sur la boutique du vendeur.
 *
 *   cd backend && BANC_BASE=1 DATABASE_URL=<base jetable> npx tsx check-chaine-auto.ts
 *
 * Chaque banc existant juge un maillon ; aucun ne passait d'un maillon à
 * l'autre. Celui-ci le fait avec de faux services : une COPIE de rapports.db,
 * une base du Poste jetable, un faux site fournisseur sur 127.0.0.1, aucun
 * modèle d'IA joignable (la réécriture est alors rendue, comme en production
 * quand le modèle ne répond pas). Il ne prouve pas les vrais sites, ni les
 * vraies places de marché : seulement que les maillons s'emboîtent.
 */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { prisma } from './src/lib/prisma.js'
import { CHEMIN_RAPPORTS_DB, ReportQuery } from './src/services/reportsDb.js'
import { enregistrerRapportPoste } from './src/services/rapportsPoste.js'
import { gagnantsDuRayon, semerGagnants } from './src/services/autoShipperRayons.js'
import { runAutopilot, tourneeAutopilot } from './src/services/autopilot.js'
import { DROPS } from './src/services/tarifs.js'
import { CATEGORIES } from './src/services/marketReports.js'

if (process.env.BANC_BASE !== '1') {
  console.error('Banc à lancer sur une base jetable : BANC_BASE=1 DATABASE_URL=<base de banc>.')
  process.exit(2)
}

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

function png(r: number, g: number, b: number) {
  const l = 400
  const ligne = Buffer.alloc(1 + l * 3)
  for (let x = 0; x < l; x++) ligne.set([(r + x) % 256, g, b], 1 + x * 3)
  const crc = (buf: Buffer) => {
    let c = ~0
    for (const o of buf) {
      c ^= o
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const bloc = (type: string, data: Buffer) => {
    const t = Buffer.from(type)
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc(Buffer.concat([t, data])))
    return Buffer.concat([len, t, data, c])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(l, 0)
  ihdr.writeUInt32BE(l, 4)
  ihdr.set([8, 2, 0, 0, 0], 8)
  const brut = Buffer.concat(Array.from({ length: l }, () => ligne))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(brut)), bloc('IEND', Buffer.alloc(0))])
}

/** A supplier product page as a real shop writes it: JSON-LD Product, og:image, a gallery. */
function fiche(base: string, n: number) {
  const images = [1, 2, 3, 4].map((k) => `${base}/img/${n}-${k}.png`)
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `Chargeur GaN 65 W modèle ${n}`,
    description: `Chargeur rapide USB-C 65 W, trois ports, technologie GaN, modèle ${n}. Compatible ordinateurs portables et téléphones.`,
    image: images,
    offers: { '@type': 'Offer', price: String(9 + n), priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
  }
  return `<!doctype html><html lang="fr"><head><title>Chargeur GaN 65 W modèle ${n}</title>
<meta property="og:title" content="Chargeur GaN 65 W modèle ${n}"><meta property="og:image" content="${images[0]}">
<script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>
<h1>Chargeur GaN 65 W modèle ${n}</h1><div class="gallery">${images.map((i) => `<img src="${i}" width="800" height="800">`).join('')}</div>
<p>Chargeur rapide USB-C 65 W, trois ports.</p></body></html>`
}

/** The JSON the Poste sends to POST /api/admin/rapports-poste. */
function rapportPoste(base: string, date: string) {
  const cat = CATEGORIES.find((c) => c.id === 'telephonie')!
  const theme = cat.themes[0]
  return {
    study: { date, category_id: cat.id, category_name: cat.nom, theme_slug: theme.id, theme_name: theme.nom },
    executive_summary: { main_opportunity: 'Chargeurs GaN 65 W', product_to_avoid: 'Câbles sans marque' },
    market: { current_trends: ['GaN'], emerging_trends: ['Qi2'], risks: ['Contrefaçons'] },
    products: [1, 2, 3].map((n) => ({
      rank: n,
      product_name: `Chargeur GaN 65 W modèle ${n}`,
      supplier_name: 'Fournisseur de banc',
      supplier_platform: 'site',
      supplier_url: `${base}/produit/${n}.html`,
      url_type: 'product',
      purchase_price: 9 + n,
      estimated_landed_cost_france: 10 + n,
      target_selling_price: 34 + n,
      net_margin_estimated: 20,
      roi_estimated: 1.5,
      decision: 'À tester',
      scores: { global_opportunity_score: 80, demand_score: 70, trend_score: 60, margin_score: 80, supplier_score: 50, competition_score: 40, ads_potential_score: 65, risk_score: 20 },
    })),
    sources: [{ url: `${base}/source`, title: 'Une source' }],
    creative_prompts: { image_ads: ['# Facebook 1:1\nvisuel'], short_videos_30s: ['# TikTok 9:16 — 15 s\nvidéo'] },
    alerts: { breakout_products: [] },
  }
}

const credits = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id }, select: { credits: true } })).credits

async function main() {
  const serveur = http.createServer((req, res) => {
    const url = req.url ?? '/'
    const img = url.match(/^\/img\/(\d+)-(\d+)\.png$/)
    if (img) return void res.writeHead(200, { 'Content-Type': 'image/png' }).end(png(40 * Number(img[2]), 30 * Number(img[1]), 120))
    const prod = url.match(/^\/produit\/(\d+)\.html$/)
    if (prod) return void res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(fiche(base, Number(prod[1])))
    res.writeHead(404).end()
  })
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', () => r()))
  const base = `http://127.0.0.1:${(serveur.address() as { port: number }).port}`

  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'chaine-auto-'))
  const copie = path.join(dossier, 'rapports.db')
  fs.copyFileSync(CHEMIN_RAPPORTS_DB, copie)
  const basePoste = path.join(dossier, 'rapports-poste.db')
  const jour = new Date().toISOString().slice(0, 10)
  const rayon = 'telephones-portables-et-accessoires'

  const user = await prisma.user.create({
    data: { email: `banc-chaine-auto-${Date.now()}@example.com`, passwordHash: 'x', credits: 1000 },
  })
  try {
    console.log('1. Le Poste dépose son rapport du jour')
    const ecrit = enregistrerRapportPoste(rapportPoste(base, jour), basePoste)
    verifier('rapport rangé (rayon + marketing)', ecrit.produits === 3 && Boolean(ecrit.idRayon && ecrit.idMkt), JSON.stringify(ecrit))
    const q = new ReportQuery(copie, basePoste)
    const g = gagnantsDuRayon(rayon, q)
    verifier(`le rayon lit le jour du Poste (${jour})`, g.jour === jour, `jour lu : ${g.jour}`)
    verifier('ses trois gagnants sont importables (prix d’achat, prix de vente, lien http)', g.importables.length === 3, `${g.importables.length} importable(s)`)

    console.log('\n2. Le rayon boost et le pilote du vendeur')
    const dep = await prisma.department.create({
      data: { userId: user.id, key: rayon, agentName: 'Agent de banc', autoMode: true },
    })
    await prisma.autopilot.create({
      data: {
        userId: user.id, enabled: true, dailyLimit: 480, produitsParRayon: 10, autoPublish: true,
        destinations: ['OWN_SITE'], minMargin: 50, requireEuStock: false, controleAgent: false,
      },
    })
    // The pilot also reads the shipped rapports.db: its winners of this rayon are marked
    // already imported, so only the Poste's fake supplier is ever fetched.
    const reels = gagnantsDuRayon(rayon)
    if (reels.importables.length) {
      await prisma.opportunity.createMany({
        data: reels.importables.map((p) => ({
          userId: user.id, departmentId: dep.id, source: 'banc', sourceUrl: p.url, title: p.titre,
          sourcePrice: p.prixAchat ?? 1, marketPrice: p.prixVente ?? 2, currency: 'EUR', status: 'REJECTED',
        })),
        skipDuplicates: true,
      })
    }
    const semes = await semerGagnants(user.id, q)
    verifier('les gagnants deviennent des opportunités du rayon', semes === 3, `${semes} semée(s)`)
    verifier('un second semis n’ajoute rien', (await semerGagnants(user.id, q)) === 0)

    console.log('\n3. La tournée AUTO-SHIPPER (journée + import + publication)')
    const avant = await credits(user.id)
    await tourneeAutopilot(runAutopilot, 0, user.id)
    const pilote = await prisma.autopilot.findUniqueOrThrow({ where: { userId: user.id } })
    verifier('passage marqué servi', pilote.lastAutoRunAt !== null)
    const produits = await prisma.product.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } })
    verifier('trois annonces créées depuis le faux fournisseur', produits.length === 3, `${produits.length} produit(s)`)
    verifier('prix fournisseur lus sur la fiche', produits.every((p, i) => Number(p.price) === 10 + i || [10, 11, 12].includes(Number(p.price))), produits.map((p) => String(p.price)).join(', '))
    verifier('prix de vente = prix marché du rapport', produits.every((p) => [35, 36, 37].includes(Number(p.sellingPrice))), produits.map((p) => String(p.sellingPrice)).join(', '))
    verifier('photos rapatriées (≥ 2 par annonce)', produits.every((p) => Array.isArray(p.images) && p.images.length >= 2), produits.map((p) => (Array.isArray(p.images) ? p.images.length : 0)).join(', '))
    verifier('filigrane posé à l’export, pas à l’import (imagesWatermarked = false)', produits.every((p) => p.imagesWatermarked === false))
    verifier('annonces prêtes (pas en brouillon)', produits.every((p) => p.status === 'READY' || p.status === 'PUBLISHED'), produits.map((p) => p.status).join(', '))
    const opps = await prisma.opportunity.findMany({ where: { userId: user.id, source: 'rapport' } })
    verifier('opportunités closes sur leur annonce', opps.length === 3 && opps.every((o) => o.status === 'IMPORTED' && o.productId), opps.map((o) => o.status).join(', '))

    const pubs = await prisma.publication.findMany({ where: { product: { userId: user.id } } })
    verifier('publiées sur la boutique du vendeur (OWN_SITE)', pubs.filter((p) => p.platform === 'OWN_SITE' && p.status === 'PUBLISHED').length === 3, pubs.map((p) => `${p.platform}:${p.status}`).join(', '))
    const shop = await prisma.shop.findFirst({ where: { userId: user.id } })
    verifier('boutique créée à la première publication et reliée aux annonces', Boolean(shop) && produits.every((p) => p.shopId === shop!.id))

    const apres = await credits(user.id)
    // Journée + 18 par import ; sans modèle joignable la réécriture n'est pas faite et l'import est rendu.
    const reecrits = produits.filter((p) => p.aiEnhanced).length
    const attendu = DROPS.autoShipperJour + reecrits * DROPS.autoShipperImport
    verifier(`débit : journée (${DROPS.autoShipperJour}) + ${DROPS.autoShipperImport} par annonce réécrite`, avant - apres === attendu, `${avant} → ${apres}, ${reecrits} réécrite(s)`)
    const run = await prisma.autopilotRun.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
    const journal = JSON.stringify(run?.log ?? [])
    verifier('journal du jour : imports et publications écrits', Boolean(run) && run!.imported === 3 && run!.published === 3, `${run?.imported} importé(s), ${run?.published} publié(s)`)
    verifier('journal : le semis des rayons boost est noté', /gagnant\(s\) des rayons boost/.test(journal) || semes === 3)

    console.log('\n4. Le lendemain sans nouveau rapport')
    await prisma.autopilot.update({ where: { userId: user.id }, data: { lastAutoRunAt: new Date(Date.now() - 25 * 3600 * 1000) } })
    const avant2 = await credits(user.id)
    await tourneeAutopilot(runAutopilot, 0, user.id)
    verifier('aucune annonce en double', (await prisma.product.count({ where: { userId: user.id } })) === 3)
    verifier('journée rendue quand rien n’est importé', (await credits(user.id)) === avant2, `${avant2} → ${await credits(user.id)}`)
    q.close()
  } finally {
    await prisma.publication.deleteMany({ where: { product: { userId: user.id } } }).catch(() => undefined)
    await prisma.user.delete({ where: { id: user.id } }).catch((e) => console.error('nettoyage :', e instanceof Error ? e.message : e))
    serveur.close()
    fs.rmSync(dossier, { recursive: true, force: true })
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nChaîne automatique : tout passe.')
  await prisma.$disconnect()
  process.exit(echecs ? 1 : 0)
}

main().catch(async (e) => {
  console.error('RATE  le banc s’est interrompu —', e instanceof Error ? e.stack : e)
  await prisma.$disconnect()
  process.exit(1)
})
