/**
 * Essai de fumée de la VRAIE fenêtre Electron : profil jetable, écran lu par le
 * protocole de débogage, une fausse clé présentée à l'API réelle, puis arrêt.
 * Lancer : node check-fenetre.cjs (ouvre une fenêtre quelques secondes).
 */
const { spawn } = require('node:child_process')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const desktop = __dirname
const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-fumee-'))
const electron = require(path.join(desktop, 'node_modules/electron'))
const enfant = spawn(electron, ['.', '--remote-debugging-port=9377', `--user-data-dir=${profil}`], { cwd: desktop, stdio: ['ignore', 'pipe', 'pipe'] })
let sortie = ''
enfant.stdout.on('data', (d) => (sortie += d))
enfant.stderr.on('data', (d) => (sortie += d))

const pause = (ms) => new Promise((ok) => setTimeout(ok, ms))

async function main() {
  let cible = null
  for (let i = 0; i < 30 && !cible; i++) {
    await pause(1000)
    try {
      const liste = await (await fetch('http://127.0.0.1:9377/json')).json()
      // Three views live in the window: the shell (coque.html), the site, and the local panel (index.html).
      const coque = liste.find((c) => c.type === 'page' && c.url.includes('coque.html'))
      const site = liste.find((c) => c.url.includes('drop-shipper.fr'))
      const panneau = liste.find((c) => c.type === 'page' && c.url.includes('renderer/index.html'))
      if (coque && site && panneau) {
        console.log('VUES', JSON.stringify({ coque: coque.url.split('/').pop(), site: site.url }))
        cible = panneau
      }
    } catch {
      /* not up yet */
    }
  }
  if (!cible) throw new Error('fenêtre introuvable')
  const ws = new WebSocket(cible.webSocketDebuggerUrl)
  await new Promise((ok, ko) => ((ws.onopen = ok), (ws.onerror = ko)))
  let n = 0
  const attente = new Map()
  ws.onmessage = (m) => {
    const j = JSON.parse(m.data)
    if (j.id && attente.has(j.id)) attente.get(j.id)(j.result)
  }
  const evaluer = (expression) =>
    new Promise((ok) => {
      const id = ++n
      attente.set(id, (r) => ok(r.result ? r.result.value : r))
      ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
  await pause(1500)
  const etat = await evaluer(`(async () => {
    const e = await window.desktop.etat()
    return JSON.stringify({
      url: location.href.split('/').slice(-2).join('/'),
      pont: Object.keys(window.desktop),
      connecte: e.connecte, margeMin: e.margeMin, rayons: e.rayons, plateformes: e.plateformes.map((p) => p.id),
      connexionVisible: !document.getElementById('connexion').hidden,
      tableauCache: document.getElementById('tableau').hidden,
      champs: ['cle', 'relier', 'circuit', 'reseaux', 'plafond-imports', 'marge-min', 'rayons', 'aucun-rayon', 'liens', 'annonces', 'plateformes', 'journal'].filter((id) => !document.getElementById(id)),
    })
  })()`)
  console.log('ETAT', etat)
  const e = JSON.parse(etat)
  if (e.champs.length || !e.connexionVisible || !e.pont.includes('choisirRayons')) throw new Error('écran incomplet : ' + etat)
  // A wrong key against the real API: the screen must say so, not crash.
  const refus = await evaluer(`(async () => {
    document.getElementById('cle').value = 'dsp_desk_fausse_cle_de_banc'
    document.getElementById('relier').click()
    await new Promise((ok) => setTimeout(ok, 6000))
    return JSON.stringify({ erreur: document.getElementById('erreur-cle').textContent, tableauCache: document.getElementById('tableau').hidden })
  })()`)
  console.log('CLE_FAUSSE', refus)
  if (!/refus/i.test(JSON.parse(refus).erreur)) throw new Error('la fausse clé aurait dû être refusée')
  ws.close()
}

main()
  .catch((e) => (console.log('ECHEC', e.message), (process.exitCode = 1)))
  .finally(() => {
    enfant.kill()
    setTimeout(() => {
      console.log('SORTIE_ELECTRON', sortie.slice(0, 1500))
      fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5 })
      process.exit(process.exitCode || 0)
    }, 1500)
  })
