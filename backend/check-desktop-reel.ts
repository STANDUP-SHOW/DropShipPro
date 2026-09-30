import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { prisma } from './src/lib/prisma.js'
import { signToken } from './src/middleware/auth.js'

/**
 * L'application desktop de bout en bout, contre l'API DE PRODUCTION et le vrai site.
 *
 *   cd backend && npx tsx check-desktop-reel.ts            # l'application empaquetée (desktop/dist/win-unpacked)
 *   cd backend && npx tsx check-desktop-reel.ts --exe "C:/…/DropShipper Desktop.exe"   # l'application installée
 *   cd backend && npx tsx check-desktop-reel.ts --source   # `electron .` depuis desktop/
 *
 * Un compte jetable (supprimé à la fin, quoi qu'il arrive) reçoit une annonce en
 * attente pour Facebook. L'application démarre sur un profil jetable SANS clé ; la
 * session du site est posée dans son navigateur intégré (jeton du compte jetable),
 * et l'application doit se relier toute seule (clé desktop créée). Puis : partage
 * d'un lien depuis la barre, annonce et rayons affichés, « Préparer » sur un profil
 * sans session Facebook (message « connectez-vous », ni pause ni publication).
 *
 * Aucun import n'est lancé (le circuit reste coupé) : aucun drop, aucun appel IA.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail && !condition ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}
const pause = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

type Cible = { type: string; url: string; webSocketDebuggerUrl: string }
type Reponse = { result?: { value?: string }; exceptionDetails?: { text?: string; exception?: { description?: string } } }

/** Une connexion au protocole de débogage d'une des vues de la fenêtre. */
async function ouvrirVue(cible: Cible) {
  const ws = new WebSocket(cible.webSocketDebuggerUrl)
  await new Promise((ok, ko) => ((ws.onopen = ok), (ws.onerror = ko)))
  let n = 0
  const attente = new Map<number, (r: Reponse) => void>()
  ws.onmessage = (m) => {
    const j = JSON.parse(String(m.data))
    if (j.id && attente.has(j.id)) attente.get(j.id)!(j.result)
  }
  const evaluer = (expression: string) =>
    new Promise<string>((ok, ko) => {
      const id = ++n
      attente.set(id, (r) => (r?.exceptionDetails ? ko(new Error(`erreur dans la vue : ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)) : ok(String(r?.result?.value ?? ''))))
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
  return { evaluer, fermer: () => ws.close() }
}

async function main() {
  const desktop = path.resolve(import.meta.dirname, '..', 'desktop')
  const source = process.argv.includes('--source')
  // --exe <chemin> : l'application INSTALLÉE par l'installeur, au lieu du dossier de fabrication.
  const choisi = process.argv.indexOf('--exe')
  const exe = choisi > 0 ? process.argv[choisi + 1] : path.join(desktop, 'dist', 'win-unpacked', 'DropShipper Desktop.exe')
  if (!source && !fs.existsSync(exe)) throw new Error(`Application empaquetée absente (${exe}) : lancez « npm run build » dans desktop/, ou passez --source.`)

  const marque = `banc-desktop-reel-${Date.now()}`
  const user = await prisma.user.create({ data: { email: `${marque}@exemple.test`, passwordHash: 'x', credits: 800 } })
  const produit = await prisma.product.create({
    data: { userId: user.id, sourceUrl: `https://exemple.test/${marque}`, images: ['https://exemple.test/a.jpg'], price: 10, sellingPrice: 30, imagesWatermarked: false, title: 'Lampe de bureau du banc', description: 'Une lampe.' },
  })
  const publication = await prisma.publication.create({ data: { productId: produit.id, platform: 'FACEBOOK', status: 'PENDING', targetCategory: 'Maison et jardin > Éclairage > Lampes' } })
  const vente = await prisma.order.create({ data: { userId: user.id, productId: produit.id, platform: 'EBAY', buyerName: 'Alice Banc', buyerAddress: { street: '1 rue du Banc', city: 'Paris', zip: '75001', country: 'France' }, amount: 30 } })
  const jetonSite = signToken(user.id)

  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-reel-'))
  const port = 9388
  const env = { ...process.env, DROPSHIPPER_DESKTOP_PROFIL: profil }
  const enfant = source
    ? spawn(path.join(desktop, 'node_modules', 'electron', 'dist', 'electron.exe'), ['.', `--remote-debugging-port=${port}`], { cwd: desktop, env, stdio: 'ignore' })
    : spawn(exe, [`--remote-debugging-port=${port}`], { env, stdio: 'ignore' })

  const vues: Array<{ fermer: () => void }> = []
  try {
    let liste: Cible[] = []
    const trouver = (f: (c: Cible) => boolean) => liste.find((c) => f(c))
    for (let i = 0; i < 40; i++) {
      await pause(1000)
      try {
        liste = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as Cible[]
        if (trouver((c) => c.url.includes('coque.html')) && trouver((c) => c.url.includes('drop-shipper.fr')) && trouver((c) => c.url.includes('renderer/index.html'))) break
      } catch {
        /* not up yet */
      }
    }
    const cibleCoque = trouver((c) => c.url.includes('coque.html'))
    const cibleSite = trouver((c) => c.url.includes('drop-shipper.fr'))
    const ciblePanneau = trouver((c) => c.url.includes('renderer/index.html'))
    if (!cibleCoque || !cibleSite || !ciblePanneau) throw new Error(`les trois vues ne sont pas là : ${JSON.stringify(liste.map((c) => c.url))}`)
    await pause(3000)
    const coque = await ouvrirVue(cibleCoque)
    const site = await ouvrirVue(cibleSite)
    const panneau = await ouvrirVue(ciblePanneau)
    vues.push(coque, site, panneau)

    console.log(`Application ${source ? 'lancée depuis les sources' : 'empaquetée'} : le site dans la fenêtre, contre l’API de production`)
    verifier('le site drop-shipper.fr est ouvert dans la fenêtre, sur le tableau de bord', /drop-shipper\.fr\/(dashboard|login)/.test(cibleSite.url), cibleSite.url)
    const etatPanneau = async () =>
      JSON.parse(
        await panneau.evaluer(`(async () => {
          const e = await window.desktop.etat()
          const texte = (id) => document.getElementById(id).innerText
          return JSON.stringify({ connecte: e.connecte, tableau: !document.getElementById('tableau').hidden, liens: e.liens, annonces: texte('annonces'), nbAnnonces: e.annonces.length, rayons: e.rayons, rayonsEcran: document.querySelectorAll('#rayons input').length, erreur: e.erreur, plateformes: texte('plateformes'), journal: e.journal.map((j) => j.type) })
        })()`),
      )
    let e = await etatPanneau()
    verifier('sans clé : le panneau demande la connexion, rien ne tourne', !e.connecte && !e.tableau)

    console.log('\nLiaison automatique depuis la session du site')
    // The vendor's session on the site, in the app's own browser: here, the throwaway account's token.
    await site.evaluer(`(() => { localStorage.setItem('droppost_token', ${JSON.stringify(jetonSite)}); location.href = '/dashboard'; return 'ok' })()`)
    // La liaison se fait en plusieurs temps (clé créée, compte lu, écran prévenu) : on attend l’écran, pas le premier signe.
    for (let i = 0; i < 30 && !(e.connecte && e.tableau); i++) {
      await pause(1500)
      e = await etatPanneau().catch(() => e)
    }
    verifier('le poste s’est relié tout seul : clé desktop créée avec la session du site, tableau affiché', e.connecte && e.tableau, JSON.stringify({ connecte: e.connecte, erreur: e.erreur }))
    const cles = await prisma.apiKey.findMany({ where: { userId: user.id, revokedAt: null } })
    verifier('une clé de type desktop existe sur le compte, nommée d’après ce poste', cles.length === 1 && cles[0].prefix.startsWith('dsp_desk_') && /DropShipper Desktop/.test(cles[0].name), JSON.stringify(cles.map((c) => [c.prefix, c.name])))
    const coqueEtat = JSON.parse(await coque.evaluer('window.coque.etat().then((x) => JSON.stringify(x))'))
    verifier('la barre affiche le compte relié', coqueEtat.compte === user.email && coqueEtat.connecte, JSON.stringify(coqueEtat))

    console.log('\nPartage d’un lien depuis la barre')
    const partage = JSON.parse(await coque.evaluer(`window.coque.partager('https://exemple.test/produit-partage-${marque}?utm_source=banc').then((x) => JSON.stringify(x))`))
    verifier('le lien est accepté', partage.ok === true, JSON.stringify(partage))
    const refus = JSON.parse(await coque.evaluer(`window.coque.partager('pas une adresse').then((x) => JSON.stringify(x))`))
    verifier('un texte qui n’est pas une adresse est refusé, sans appel serveur', refus.ok === false && /adresse/.test(refus.erreur))
    for (let i = 0; i < 10 && !(e.liens || []).some((l: { url: string }) => l.url.includes('produit-partage')); i++) {
      await pause(1500)
      e = await etatPanneau()
    }
    const lien = (e.liens || []).find((l: { url: string }) => l.url.includes('produit-partage'))
    verifier('il apparaît dans « Produits partagés — à importer »', Boolean(lien), JSON.stringify(e.liens))
    const enBase = await prisma.sharedLink.findFirst({ where: { userId: user.id } })
    verifier('côté serveur : même liste que le mobile, source « desktop »', enBase?.source === 'desktop' && (enBase?.url ?? '').includes('produit-partage'), JSON.stringify(enBase))

    console.log('\nAnnonces et rayons')
    for (let i = 0; i < 20 && (!e.nbAnnonces || !e.rayons.length); i++) {
      await pause(1500)
      e = await etatPanneau()
    }
    verifier('l’annonce en attente pour Facebook est listée, avec son prix', e.nbAnnonces === 1 && /Facebook — Lampe de bureau du banc — 30 €/.test(e.annonces), e.annonces)
    const rapports = await prisma.marketReport.count()
    verifier('les rayons du jour sont proposés en cases à cocher', rapports === 0 ? e.rayons.length === 0 : e.rayons.length > 0 && e.rayonsEcran === e.rayons.length, JSON.stringify(e.rayons))

    console.log('\nCommande chez le fournisseur (RPA), fournisseur injoignable')
    for (let i = 0; i < 10 && !/Alice Banc/.test(await panneau.evaluer("document.getElementById('achats').innerText")); i++) await pause(1500)
    const achatsEcran = await panneau.evaluer("document.getElementById('achats').innerText")
    verifier('la vente à commander est listée avec l’acheteur et le fournisseur', /Lampe de bureau du banc — Alice Banc, 75001 Paris/.test(achatsEcran), achatsEcran)
    const prepa = await panneau.evaluer(`(async () => {
      const bouton = [...document.querySelectorAll('#achats button')].find((b) => /Préparer/.test(b.textContent))
      bouton.click()
      for (let i = 0; i < 40; i++) {
        await new Promise((ok) => setTimeout(ok, 1000))
        const e = await window.desktop.etat()
        const a = e.achats.find((x) => x.buyerName === 'Alice Banc')
        if (a && a.resultat) return JSON.stringify(a.resultat)
      }
      return 'rien'
    })()`)
    verifier('fournisseur injoignable : échec dit au vendeur, rien de commandé', /ouvre pas/.test(prepa), prepa)
    const venteApres = await prisma.order.findUniqueOrThrow({ where: { id: vente.id } })
    verifier('côté serveur : la vente reste NEW, la raison est écrite', venteApres.status === 'NEW' && /ouvre pas/.test(venteApres.supplierOrderError ?? ''), JSON.stringify([venteApres.status, venteApres.supplierOrderError]))

    console.log('\n« Préparer » sur un profil sans session Facebook')
    const resultat = await panneau.evaluer(`(async () => {
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
    e = await etatPanneau()
    verifier('aucune pause de sécurité, aucune publication au journal', !/En pause/.test(e.plateformes) && !e.journal.includes('publication') && !e.journal.includes('alerte'), JSON.stringify(e.journal))
    const apres = await prisma.publication.findUniqueOrThrow({ where: { id: publication.id } })
    verifier('côté serveur, la publication est toujours en attente', apres.status === 'PENDING', apres.status)
  } finally {
    vues.forEach((v) => v.fermer())
    enfant.kill()
    await pause(1500)
    await prisma.order.deleteMany({ where: { userId: user.id } })
    await prisma.publication.deleteMany({ where: { product: { userId: user.id } } })
    await prisma.product.deleteMany({ where: { userId: user.id } })
    await prisma.sharedLink.deleteMany({ where: { userId: user.id } })
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
