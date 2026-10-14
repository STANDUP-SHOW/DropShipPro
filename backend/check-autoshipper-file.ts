import http from 'node:http'
import zlib from 'node:zlib'
import { prisma } from './src/lib/prisma.js'
import { runAutopilot, tourneeAutopilot } from './src/services/autopilot.js'
import {
  expirerFileAutoShipper,
  importerLigneAutoShipper,
  voieDe,
  ORIGINE_AUTOSHIPPER,
} from './src/services/autoShipperFile.js'
import { DROPS } from './src/services/tarifs.js'

/**
 * Les produits que seul un navigateur lit, en AUTO-SHIPPER (14/10/2026) — contre
 * une base de banc, jamais la production (refuse de tourner sans BANC_BASE=1).
 *
 *   cd backend && BANC_BASE=1 DATABASE_URL=<base jetable> npx tsx check-autoshipper-file.ts
 *
 * Vérifie : la voie de chaque fiche (serveur, API AliExpress, desktop, extension) ;
 * le pilote met en file au lieu d'écarter, payé une fois ; le relevé de
 * l'application importe sans nouveau débit et clôt l'opportunité ; l'agent de
 * contrôle n'est payé que sur la voie extension ; une fiche non relevée en 24 h
 * est rendue, et la journée aussi quand rien n'a été importé, une seule fois.
 */

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
  for (let x = 0; x < l; x++) ligne.set([r, g, b], 1 + x * 3)
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

const credits = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id }, select: { credits: true } })).credits

async function compte(etiquette: string, desktop: boolean) {
  const user = await prisma.user.create({ data: { email: `banc-as-file-${etiquette}-${Date.now()}@example.com`, passwordHash: 'x', credits: 1000 } })
  if (desktop) {
    await prisma.apiKey.create({ data: { userId: user.id, name: 'Banc desktop', keyHash: `banc-${user.id}`, prefix: 'dsp_desk_banc', lastUsedAt: new Date() } })
  }
  await prisma.autopilot.create({
    data: { userId: user.id, enabled: true, dailyLimit: 10, produitsParRayon: 10, autoPublish: false, destinations: [], minMargin: 0, requireEuStock: false, controleAgent: true },
  })
  const opp = (url: string, title: string) =>
    prisma.opportunity.create({ data: { userId: user.id, source: 'banc', sourceUrl: url, title, sourcePrice: 5, marketPrice: 20, currency: 'EUR', isNew: true } })
  await opp('https://www.temu.com/fr/lampe-g-601099512345678.html', 'Lampe LED pliable')
  await opp('https://fr.shein.com/robe-p-123456.html', 'Robe d’été')
  return user
}

async function main() {
  console.log('Voies')
  const sans = { aliexpressRelie: false, aDesktop: false }
  verifier('une fiche lisible reste au serveur', voieDe('https://www.bigbuy.eu/fr/produit-1.html', sans) === 'serveur')
  verifier('AliExpress relié : par son API', voieDe('https://fr.aliexpress.com/item/1005001234567.html', { aliexpressRelie: true, aDesktop: true }) === 'api')
  verifier('Temu avec l’application desktop : par elle', voieDe('https://www.temu.com/fr/x.html', { aliexpressRelie: true, aDesktop: true }) === 'desktop')
  verifier('sans application desktop : file de l’extension', voieDe('https://fr.aliexpress.com/item/1005001234567.html', sans) === 'extension')

  const serveur = http.createServer((req, res) => {
    const n = Number(req.url?.match(/(\d)\.png/)?.[1] ?? 0)
    res.writeHead(200, { 'Content-Type': 'image/png' }).end(png(50 * n, 120, 200 - 30 * n))
  })
  await new Promise<void>((r) => serveur.listen(0, '127.0.0.1', () => r()))
  const base = `http://127.0.0.1:${(serveur.address() as { port: number }).port}`

  const desk = await compte('desktop', true)
  const ext = await compte('extension', false)
  try {
    console.log('Le pilote met en file au lieu d’écarter')
    const avant = await credits(desk.id)
    const r = await runAutopilot(desk.id)
    const lignes = await prisma.importQueue.findMany({ where: { userId: desk.id }, orderBy: { createdAt: 'asc' } })
    verifier('deux fiches en file pour l’application desktop', r.enFile === 2 && lignes.length === 2 && lignes.every((l) => l.mode === 'desktop' && l.origine?.startsWith(ORIGINE_AUTOSHIPPER)), JSON.stringify(r.log))
    verifier('aucune écartée « lisible seulement par l’extension »', !r.log.some((l) => /extension/.test(l.raison) && l.action === 'écarté'))
    verifier(`payées à la mise en file (${DROPS.autoShipperImport} drops chacune)`, avant - (await credits(desk.id)) === 2 * DROPS.autoShipperImport)
    const opps = await prisma.opportunity.findMany({ where: { userId: desk.id } })
    verifier('voie notée sur chaque opportunité, plus proposée au passage suivant', opps.every((o) => o.status === 'KEPT' && (o.raw as { voie?: string })?.voie === 'desktop'))
    const r2 = await runAutopilot(desk.id)
    verifier('second passage : rien de remis en file', r2.enFile === 0 && (await prisma.importQueue.count({ where: { userId: desk.id } })) === 2)

    console.log('Le relevé de l’application importe, sans nouveau débit')
    const avantCapture = await credits(desk.id)
    const issue = await importerLigneAutoShipper(desk.id, lignes[0].id, {
      sourceUrl: lignes[0].url,
      title: 'Lampe de bureau LED pliable',
      description: 'Lampe LED pliable, trois intensités, port USB-C.',
      price: 5,
      currency: 'EUR',
      images: [1, 2, 3].map((i) => `${base}/photo-${i}.png`),
      sourceCategory: null,
    })
    verifier('produit créé', issue.ok, JSON.stringify(issue))
    if (issue.ok) {
      const ligne = await prisma.importQueue.findUniqueOrThrow({ where: { id: lignes[0].id } })
      const opp = await prisma.opportunity.findFirstOrThrow({ where: { userId: desk.id, sourceUrl: lignes[0].url } })
      verifier('ligne importée, opportunité close sur le produit', ligne.status === 'IMPORTE' && opp.status === 'IMPORTED' && opp.productId === issue.productId)
      const apres = await credits(desk.id)
      // Sans modèle joignable (banc), la réécriture n'est pas faite : le produit est rendu, rien d'autre.
      verifier('aucun débit de plus (agent de contrôle non payé sur la voie desktop)', apres === avantCapture || apres === avantCapture + DROPS.autoShipperImport, `${avantCapture} → ${apres}`)
      const run = await prisma.autopilotRun.findFirst({ where: { userId: desk.id, imported: 1 }, orderBy: { createdAt: 'desc' } })
      verifier('journal du jour : une ligne « importé » par l’application desktop', Boolean(run && JSON.stringify(run.log).includes('application desktop')))
      const deux = await importerLigneAutoShipper(desk.id, lignes[0].id, { sourceUrl: lignes[0].url, title: 'x', description: '', price: 1, currency: 'EUR', images: [], sourceCategory: null })
      verifier('une ligne importée ne s’importe pas deux fois', !deux.ok)
    }

    console.log('Voie extension : l’agent de contrôle est la seule voie payante en plus')
    const re = await runAutopilot(ext.id)
    const lignesExt = await prisma.importQueue.findMany({ where: { userId: ext.id } })
    verifier('sans application desktop : file de l’extension', re.enFile === 2 && lignesExt.every((l) => l.mode === 'extension'))

    console.log('24 h sans relevé : tout est rendu')
    const hier = new Date(Date.now() - 25 * 3600_000)
    await prisma.importQueue.updateMany({ where: { userId: ext.id }, data: { createdAt: hier } })
    // La journée de la veille, payée par la tournée (son débit tel que billing.ts l'inscrit).
    await prisma.user.update({ where: { id: ext.id }, data: { credits: { decrement: DROPS.autoShipperJour } } })
    await prisma.dropTransaction.create({ data: { userId: ext.id, delta: -DROPS.autoShipperJour, balance: 0, motif: 'Journée AUTO-SHIPPER', createdAt: hier } })
    const avantExp = await credits(ext.id)
    const n = await expirerFileAutoShipper(ext.id)
    const apresExp = await credits(ext.id)
    verifier('deux fiches rendues', n === 2)
    verifier(
      `drops rendus : 2 × ${DROPS.autoShipperImport} + la journée (${DROPS.autoShipperJour}), rien importé ce jour-là`,
      apresExp - avantExp === 2 * DROPS.autoShipperImport + DROPS.autoShipperJour,
      `${avantExp} → ${apresExp}`,
    )
    verifier('opportunités closes, pas remises en file', (await prisma.opportunity.count({ where: { userId: ext.id, status: 'REJECTED' } })) === 2)
    const encore = await expirerFileAutoShipper(ext.id)
    verifier('un second passage ne rend rien de plus', encore === 0 && (await credits(ext.id)) === apresExp)

    console.log('Une journée jamais payée n’est jamais rendue')
    const avantNp = await credits(desk.id)
    await prisma.importQueue.updateMany({ where: { userId: desk.id, status: 'EN_ATTENTE' }, data: { createdAt: hier } })
    await expirerFileAutoShipper(desk.id)
    verifier('seul le produit est rendu', (await credits(desk.id)) - avantNp === DROPS.autoShipperImport, `${avantNp} → ${await credits(desk.id)}`)

    console.log('La journée attend les fiches en file')
    let rendue = false
    const avantT = await credits(desk.id)
    await prisma.autopilot.update({ where: { userId: desk.id }, data: { lastAutoRunAt: null } })
    await tourneeAutopilot(async () => ({ imported: 0, published: 0, skipped: 0, failed: 0, enFile: 1, log: [] }), 0, desk.id)
    rendue = (await credits(desk.id)) === avantT
    verifier('journée gardée tant que des fiches sont en file', !rendue && avantT - (await credits(desk.id)) === DROPS.autoShipperJour)
  } finally {
    serveur.close()
    await prisma.user.deleteMany({ where: { id: { in: [desk.id, ext.id] } } })
  }

  console.log(echecs ? `\n${echecs} attente(s) manquée(s).` : '\nTout passe.')
  process.exitCode = echecs ? 1 : 0
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  process.exitCode = 1
  await prisma.$disconnect()
})
