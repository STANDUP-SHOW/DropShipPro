/**
 * Banc : l'administration générale du site n'appartient qu'au Poste d'analyses.
 *
 * Prouve, sur le VRAI routeur `/api/admin` monté dans un serveur jetable (aucune
 * base touchée, la base des rapports du Poste est un fichier temporaire) :
 *  - sans la variable POSTE_ADMIN_SHA256, aucune route ne répond (503) ;
 *  - sans clé, avec une clé quelconque, avec une clé d'agent `dsp_live_…` ou avec
 *    un jeton de session : 401 ;
 *  - la clé dont l'empreinte est posée ouvre /moi ; l'empreinte d'une autre non ;
 *  - un rapport valide est rangé (201), un rapport cassé refusé (422) ;
 *  - l'ancien accès par e-mail n'existe plus (/market-reports et /rapports-poste
 *    ne vivent plus dans /api/agent).
 * Ne lit ni n'écrit la base de production : DATABASE_URL n'est pas nécessaire.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import type { AddressInfo } from 'node:net'

const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-poste-'))
process.env.RAPPORTS_POSTE_DB = path.join(dossier, 'storage', 'rapports', 'rapports-poste.db')
delete process.env.POSTE_ADMIN_SHA256

const { default: express } = await import('express')
const { adminRouter } = await import('./src/routes/admin.js')
const { PREFIXE_ADMIN, empreinteDe, empreinteAttendue, cleAdminValide } = await import('./src/middleware/adminPoste.js')
const { CATEGORIES } = await import('./src/services/marketReports.js')

let echecs = 0
function exige(condition: boolean, nom: string, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

const app = express()
app.use(express.json({ limit: '2mb' }))
app.use('/api/admin', adminRouter)
const serveur = app.listen(0)
const base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/api/admin`

async function appel(chemin: string, cle?: string, corps?: unknown) {
  const rep = await fetch(`${base}${chemin}`, {
    method: corps === undefined ? 'GET' : 'POST',
    headers: { ...(cle ? { Authorization: `Bearer ${cle}` } : {}), 'Content-Type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  })
  return { statut: rep.status, corps: (await rep.json().catch(() => null)) as Record<string, unknown> | null }
}

/** Comme le Poste : 256 bits d'aléa, préfixe dsp_adm_. */
const cle = `${PREFIXE_ADMIN}${crypto.randomBytes(32).toString('base64url')}`
const autre = `${PREFIXE_ADMIN}${crypto.randomBytes(32).toString('base64url')}`

console.log("Sans empreinte posée, l'administration est éteinte")
{
  const r = await appel('/moi', cle)
  exige(r.statut === 503, 'GET /moi → 503', String(r.corps?.error ?? '').slice(0, 60))
  exige(empreinteAttendue({ POSTE_ADMIN_SHA256: 'abc' } as NodeJS.ProcessEnv) === null, 'une empreinte mal formée vaut « pas posée »')
  exige(empreinteAttendue({ POSTE_ADMIN_SHA256: `  ${empreinteDe(cle).toUpperCase()} ` } as NodeJS.ProcessEnv) === empreinteDe(cle), 'espaces et majuscules tolérés')
}

process.env.POSTE_ADMIN_SHA256 = empreinteDe(cle)

console.log('\nQui peut entrer')
{
  exige((await appel('/moi')).statut === 401, 'sans clé → 401')
  exige((await appel('/moi', autre)).statut === 401, 'une autre clé dsp_adm_ → 401')
  exige((await appel('/moi', `dsp_live_${crypto.randomBytes(32).toString('base64url')}`)).statut === 401, 'une clé d’agent dsp_live_ → 401')
  exige((await appel('/moi', 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ4In0.abc')).statut === 401, 'un jeton de session → 401')
  exige(!cleAdminValide(empreinteDe(cle), empreinteDe(cle)), 'l’empreinte seule n’est pas la clé')
  exige(!cleAdminValide(cle.slice(PREFIXE_ADMIN.length), empreinteDe(cle)), 'la clé sans son préfixe n’ouvre pas')
  const r = await appel('/moi', cle)
  exige(r.statut === 200 && r.corps?.ok === true, 'la bonne clé → 200', JSON.stringify(r.corps))
  exige(!JSON.stringify(r.corps).includes(cle), 'la clé n’est jamais renvoyée')
}

console.log('\nDépôt d’un rapport par la clé du Poste')
{
  const cat = CATEGORIES[0]
  const theme = cat.themes[0]
  const rapport = {
    study: { date: '2026-10-03', category_id: cat.id, category_name: cat.nom, theme_slug: theme.id, theme_name: theme.nom },
    executive_summary: { main_opportunity: 'Test', product_to_avoid: 'Test' },
    market: { current_trends: ['a'], emerging_trends: ['b'], risks: ['c'] },
    products: [{
      rank: 1, product_name: 'Produit 1', supplier_name: 'Boutique test', supplier_platform: 'site', supplier_url: 'https://fournisseur.test/1',
      purchase_price: 10, estimated_landed_cost_france: 12, target_selling_price: 30, net_margin_estimated: 9, roi_estimated: 0.5, decision: 'À tester',
      scores: { global_opportunity_score: 70, demand_score: 60, trend_score: 55, margin_score: 80, supplier_score: 50, competition_score: 40, ads_potential_score: 65, risk_score: 20 },
    }],
    sources: [{ url: 'https://exemple.test/s', title: 'S' }],
    creative_prompts: { image_ads: ['# Facebook 1:1\nvisuel'], short_videos_30s: ['# TikTok 9:16 — 15 s\nvidéo'] },
    alerts: { breakout_products: [] },
  }
  exige((await appel('/rapports-poste', autre, { rapport })).statut === 401, 'sans la bonne clé → 401, rien d’écrit')
  exige(!fs.existsSync(process.env.RAPPORTS_POSTE_DB!), 'et aucune base du Poste n’a été créée')
  const ok = await appel('/rapports-poste', cle, { rapport })
  exige(ok.statut === 201 && ok.corps?.ok === true, 'rapport valide → 201', JSON.stringify(ok.corps).slice(0, 90))
  const casse = await appel('/rapports-poste', cle, { rapport: { ...rapport, study: { ...rapport.study, category_id: 'inconnue', category_name: 'Inconnue' } } })
  exige(casse.statut === 422, 'catégorie inconnue → 422', String(casse.corps?.error ?? '').slice(0, 60))
  exige((await appel('/rapports-poste', cle, {})).statut === 422, 'corps sans rapport → 422')
}

console.log('\nL’ancien accès par e-mail est coupé')
{
  const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'src', 'routes', 'agent.ts'), 'utf8')
  exige(!/requireAdmin/.test(src), 'agent.ts ne connaît plus requireAdmin')
  exige(!/'\/market-reports'|'\/rapports-poste'/.test(src), 'agent.ts ne porte plus les routes de dépôt de rapports')
  const admin = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'src', 'routes', 'admin.ts'), 'utf8')
  exige(!/requireAdmin\b|requireAuth\b/.test(admin), 'admin.ts ne s’ouvre plus par e-mail ni par session de vendeur')
  exige(/adminRouter\.use\(requireAdminPoste\)/.test(admin), 'toutes les routes d’admin.ts passent par la clé du Poste')
}

serveur.close()
fs.rmSync(dossier, { recursive: true, force: true })
console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est bon.')
process.exit(echecs ? 1 : 0)
