/**
 * Banc DESKTOP POWER dans la VRAIE fenêtre Electron (24/10/2026) : l'application
 * ouvre un faux site local en pleine page ; on vérifie que le pont n'existe que pour
 * le site, que le navigateur intégré s'ouvre dans l'emplacement demandé, se lit pour
 * l'analyse, et qu'une page tierce n'a jamais accès au pont.
 * Lancer : node check-power.cjs (sous Linux sans écran : xvfb-run node check-power.cjs)
 */
const { spawn } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')

const pause = (ms) => new Promise((ok) => setTimeout(ok, ms))
let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail && !condition ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

function serveur(html) {
  const s = http.createServer((_req, res) => res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html))
  return new Promise((ok) => s.listen(0, '127.0.0.1', () => ok(s)))
}

async function main() {
  const site = await serveur('<!doctype html><title>Faux site</title><body style="margin:0"><div id="zone" style="position:absolute;left:100px;top:120px;width:600px;height:400px"></div>Le faux site</body>')
  const tiers = await serveur('<!doctype html><title>Bibliothèque de test</title><body>Publicité active depuis le 3 octobre — Portée 12 000 — marqueur-tiers</body>')
  const urlSite = `http://127.0.0.1:${site.address().port}`
  const urlTiers = `http://127.0.0.1:${tiers.address().port}/ads`

  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'dsp-power-'))
  const electron = require(path.join(__dirname, 'node_modules/electron'))
  const args = ['.', '--remote-debugging-port=9378']
  if (process.getuid && process.getuid() === 0) args.push('--no-sandbox')
  const enfant = spawn(electron, args, { cwd: __dirname, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, DROPSHIPPER_SITE: urlSite, DROPSHIPPER_DESKTOP_PROFIL: profil } })
  let sortie = ''
  enfant.stdout.on('data', (d) => (sortie += d))
  enfant.stderr.on('data', (d) => (sortie += d))

  const cibles = async () => (await (await fetch('http://127.0.0.1:9378/json')).json()).filter((c) => c.type === 'page')
  let cibleSite = null
  for (let i = 0; i < 40 && !cibleSite; i++) {
    await pause(1000)
    try {
      cibleSite = (await cibles()).find((c) => c.url.startsWith(urlSite))
    } catch {
      /* pas encore lancée */
    }
  }
  if (!cibleSite) throw new Error(`fenêtre introuvable\n${sortie.slice(-2000)}`)

  const connecter = async (cible) => {
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
        attente.set(id, (r) => ok(r && r.result ? r.result.value : r))
        ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
      })
    return { ws, evaluer }
  }

  const s = await connecter(cibleSite)
  await pause(1000)
  const pont = JSON.parse(await s.evaluer(`JSON.stringify({ type: typeof window.dropshipperDesktop, cles: window.dropshipperDesktop ? Object.keys(window.dropshipperDesktop) : [], nav: window.dropshipperDesktop ? Object.keys(window.dropshipperDesktop.navigateur) : [] })`))
  verifier('le site en pleine page voit le pont', pont.type === 'object' && pont.cles.includes('navigateur') && pont.nav.includes('lire'), JSON.stringify(pont))

  const etat = JSON.parse(await s.evaluer(`window.dropshipperDesktop.etat().then((e) => JSON.stringify(e))`))
  verifier('état : poste non relié, trois places de marché, texte de l’accord', etat.relie === false && etat.plateformes.map((p) => p.id).join() === 'VINTED,LEBONCOIN,FACEBOOK' && /restreindre/i.test(etat.texteAccord), JSON.stringify(etat).slice(0, 300))

  const refusProfil = JSON.parse(await s.evaluer(`window.dropshipperDesktop.navigateur.ouvrir({ profil: 'persist:site', url: 'https://exemple.test' }).then((r) => JSON.stringify(r))`))
  verifier('un profil inventé par la page est refusé (jamais la session du site)', refusProfil.ok === false)

  const ouvert = JSON.parse(
    await s.evaluer(`(async () => {
      const r = document.getElementById('zone').getBoundingClientRect()
      return JSON.stringify(await window.dropshipperDesktop.navigateur.ouvrir({ profil: 'ads', url: ${JSON.stringify(urlTiers)}, zone: { x: r.x, y: r.y, width: r.width, height: r.height } }))
    })()`),
  )
  verifier('le navigateur intégré s’ouvre dans l’emplacement', ouvert.ok === true && ouvert.etat && ouvert.etat.visible === true, JSON.stringify(ouvert))

  await pause(2500)
  const lu = JSON.parse(await s.evaluer(`window.dropshipperDesktop.navigateur.lire().then((r) => JSON.stringify(r))`))
  verifier('la page ouverte se lit pour l’analyse (texte visible, adresse)', lu.ok && /marqueur-tiers/.test(lu.page.texte) && lu.page.url === urlTiers, JSON.stringify(lu).slice(0, 300))

  const pageTiers = (await cibles()).find((c) => c.url === urlTiers)
  verifier('la page tierce est une vue à part', Boolean(pageTiers))
  if (pageTiers) {
    const t = await connecter(pageTiers)
    const vu = await t.evaluer(`typeof window.dropshipperDesktop + '/' + typeof window.desktop`)
    verifier('la page tierce n’a aucun pont (ni site, ni panneau)', vu === 'undefined/undefined', vu)
    t.ws.close()
  }

  const refusSite = JSON.parse(await s.evaluer(`window.dropshipperDesktop.navigateur.aller(${JSON.stringify(urlSite + '/dashboard')}).then((r) => JSON.stringify(r))`))
  verifier('le site lui-même ne s’ouvre pas dans le navigateur intégré', refusSite.ok === false)
  const refusJs = JSON.parse(await s.evaluer(`window.dropshipperDesktop.navigateur.aller('javascript:alert(1)').then((r) => JSON.stringify(r))`))
  verifier('javascript: refusé', refusJs.ok === false)

  await s.evaluer(`window.dropshipperDesktop.navigateur.masquer()`)
  await pause(300)
  const apres = JSON.parse(await s.evaluer(`window.dropshipperDesktop.navigateur.ouvrir({ profil: 'ads' }).then((r) => JSON.stringify(r.etat))`))
  verifier('masqué puis rappelé sans emplacement : la vue garde sa page, invisible', apres.ouvert === true && apres.visible === false && apres.url === urlTiers, JSON.stringify(apres))

  s.ws.close()
  enfant.kill()
  site.close()
  tiers.close()
  console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est vert.')
  process.exit(echecs ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
