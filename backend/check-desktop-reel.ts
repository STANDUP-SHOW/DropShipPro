import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { prisma } from './src/lib/prisma.js'
import { generateApiKey } from './src/middleware/apiKey.js'

/**
 * L'application desktop de bout en bout, contre l'API DE PRODUCTION.
 *
 *   cd backend && npx tsx check-desktop-reel.ts            # l'application empaquetée (desktop/dist/win-unpacked)
 *   cd backend && npx tsx check-desktop-reel.ts --exe "C:/…/DropShipper Desktop.exe"   # l'application installée
 *   cd backend && npx tsx check-desktop-reel.ts --source   # `electron .` depuis desktop/
 *
 * Un compte jetable (supprimé à la fin, quoi qu'il arrive) reçoit une clé desktop,
 * une annonce et une publication en attente pour Facebook. L'application démarre
 * sur un profil jetable avec cette clé, et son écran est lu par le protocole de
 * débogage : tableau affiché, annonce listée, rayons du jour, puis « Préparer ».
 * Le profil n'a aucune session Facebook : le résultat attendu est le message
 * « vous n'êtes pas connecté », sans pause ni publication.
 *
 * Aucun import n'est lancé (le circuit reste coupé) : aucun drop, aucun appel IA.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail && !condition ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}
const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

async function main() {
  const desktop = path.resolve(import.meta.dirname, '..', 'desktop')
  const source = process.argv.includes('--source')
  // --exe <chemin> : l'application INSTALLÉE par l'installeur, au lieu du dossier de fabrication.
  const choisi = process.argv.indexOf('--exe')
  const exe = choisi > 0 ? process.argv[choisi + 1] : path.join(desktop, 'dist', 'win-unpacked', 'DropShipper Desktop.exe')
  if (!source && !fs.existsSync(exe)) throw new Error(`Application empaquetée absente (${exe}) : lancez « npm run build » dans desktop/, ou passez --source.`)

  const marque = `banc-desktop-reel-${Date.now()}`
  const user = await prisma.user.create({ data: { email: `${marque}@exemple.test`, passwordHash: 'x', credits: 800 } })
  const cle = generateApiKey('desktop')
  await prisma.apiKey.create({ data: { userId: user.id, name: 'banc desktop réel', keyHash: cle.keyHash, prefix: cle.prefix } })
  const produit = await prisma.product.create({
    data: { userId: user.id, sourceUrl: `https://exemple.test/${marque}`, images: ['https://exemple.test/a.jpg'], price: 10, sellingPrice: 30, imagesWatermarked: false, title: 'Lampe de bureau du banc', description: 'Une lampe.' },
  })
  const publication = await prisma.publication.create({ data: { productId: produit.id, platform: 'FACEBOOK', status: 'PENDING', targetCategory: 'Maison et jardin > Éclairage > Lampes' } })

  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-reel-'))
  fs.writeFileSync(path.join(profil, 'config.json'), JSON.stringify({ apiBase: 'https://api.drop-shipper.fr', cle: cle.key, cleChiffree: null, accords: {}, plafonds: {} }))

  const port = 9388
  const env = { ...process.env, DROPSHIPPER_DESKTOP_PROFIL: profil }
  const enfant = source
    ? spawn(path.join(desktop, 'node_modules', 'electron', 'dist', 'electron.exe'), ['.', `--remote-debugging-port=${port}`], { cwd: desktop, env, stdio: 'ignore' })
    : spawn(exe, [`--remote-debugging-port=${port}`], { env, stdio: 'ignore' })

  try {
    let cible: { webSocketDebuggerUrl: string } | undefined
    for (let i = 0; i < 40 && !cible; i++) {
      await pause(1000)
      try {
        const liste = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as Array<{ type: string; url: string; webSocketDebuggerUrl: string }>
        cible = liste.find((c) => c.type === 'page' && /renderer\/index\.html/.test(c.url))
      } catch {
        /* not up yet */
      }
    }
    if (!cible) throw new Error('la fenêtre de contrôle ne s’est pas ouverte')
    const ws = new WebSocket(cible.webSocketDebuggerUrl)
    await new Promise((ok, ko) => ((ws.onopen = ok), (ws.onerror = ko)))
    let n = 0
    const attente = new Map<number, (r: { result?: { value?: string; description?: string }; exceptionDetails?: { text?: string; exception?: { description?: string } } }) => void>()
    ws.onmessage = (m) => {
      const j = JSON.parse(String(m.data))
      if (j.id && attente.has(j.id)) attente.get(j.id)!(j.result)
    }
    const evaluer = (expression: string) =>
      new Promise<string>((ok, ko) => {
        const id = ++n
        attente.set(id, (r) => (r?.exceptionDetails ? ko(new Error(`erreur dans l’écran : ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)) : ok(String(r?.result?.value ?? ''))))
        ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
      })
    const ecran = async () =>
      JSON.parse(
        await evaluer(`(async () => {
          const e = await window.desktop.etat()
          const texte = (id) => document.getElementById(id).innerText
          return JSON.stringify({ connecte: e.connecte, tableau: !document.getElementById('tableau').hidden, annonces: texte('annonces'), nbAnnonces: e.annonces.length, rayons: e.rayons, rayonsEcran: document.querySelectorAll('#rayons input').length, erreur: e.erreur, plateformes: texte('plateformes'), journal: e.journal.map((j) => j.type) })
        })()`),
      )

    console.log(`Application ${source ? 'lancée depuis les sources' : 'empaquetée'} contre l’API de production`)
    await pause(3000) // the screen script needs a moment after the window opens (first launch after install is slower)
    let e = await ecran()
    for (let i = 0; i < 20 && (!e.nbAnnonces || !e.rayons.length); i++) {
      await pause(1500)
      e = await ecran()
    }
    verifier('la clé desktop est acceptée : le tableau est affiché', e.connecte && e.tableau, JSON.stringify(e))
    verifier('l’annonce en attente pour Facebook est listée à l’écran, avec son prix', e.nbAnnonces === 1 && /Facebook — Lampe de bureau du banc — 30 €/.test(e.annonces), e.annonces)
    const rapports = await prisma.marketReport.count()
    verifier('les rayons du jour sont lus et proposés en cases à cocher', rapports === 0 ? e.rayons.length === 0 : e.rayons.length > 0 && e.rayonsEcran === e.rayons.length, JSON.stringify(e.rayons))
    verifier('les trois plateformes sont affichées, aucune en mode automatique', /Vinted/.test(e.plateformes) && /Leboncoin/.test(e.plateformes) && /Facebook/.test(e.plateformes) && !/Mode automatique actif/.test(e.plateformes))

    console.log('\n« Préparer » sur un profil sans session Facebook')
    const resultat = await evaluer(`(async () => {
      const bouton = [...document.querySelectorAll('#annonces button')].find((b) => b.textContent === 'Préparer')
      bouton.click()
      for (let i = 0; i < 40; i++) {
        await new Promise((ok) => setTimeout(ok, 1000))
        const t = document.getElementById('resultat-annonce').textContent
        if (t && !/Ouverture/.test(t)) return t
      }
      return document.getElementById('resultat-annonce').textContent
    })()`)
    verifier('la vraie page Facebook s’ouvre, la session absente est reconnue et dite au vendeur', /pas connecté à Facebook/.test(resultat), resultat)
    e = await ecran()
    verifier('aucune pause de sécurité, aucune publication au journal', !/En pause/.test(e.plateformes) && !e.journal.includes('publication') && !e.journal.includes('alerte'), JSON.stringify(e.journal))
    const apres = await prisma.publication.findUniqueOrThrow({ where: { id: publication.id } })
    verifier('côté serveur, la publication est toujours en attente', apres.status === 'PENDING', apres.status)
    ws.close()
  } finally {
    enfant.kill()
    await pause(1500)
    await prisma.publication.deleteMany({ where: { product: { userId: user.id } } })
    await prisma.product.deleteMany({ where: { userId: user.id } })
    await prisma.sharedLink.deleteMany({ where: { userId: user.id } }).catch(() => undefined)
    await prisma.apiKey.deleteMany({ where: { userId: user.id } })
    await prisma.user.deleteMany({ where: { id: user.id } })
    fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5 })
    await prisma.$disconnect()
  }

  console.log(echecs ? `\n${echecs} attente(s) manquée(s).` : '\nApplication desktop, de bout en bout : tout passe.')
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
