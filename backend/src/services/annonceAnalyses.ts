/**
 * Le robot qui annonce aux moteurs chaque nouvelle page d'analyse.
 *
 * Demandé par Max le 03/10/2026 : « un robot qui donne immédiatement l'URL
 * créée à analyser […] en mode auto ». Une analyse devient publique quand
 * l'import de rapports.db est poussé sur main, donc au démarrage de l'API qui
 * suit : c'est là que le robot part, pas sur une horloge aveugle.
 *
 * Il part aussi à chaque dépôt de rapports.db par l'importateur
 * (POST /api/admin/rapports-db), sans redémarrage.
 *
 * Ce qu'il fait : il lit les adresses du sitemap des analyses, retire celles
 * déjà annoncées (fichier dans storage/, le volume Railway), et envoie le reste
 * à IndexNow — Bing (donc Copilot et la recherche de ChatGPT), Yandex, Seznam,
 * Naver. Google n'écoute pas IndexNow, n'accepte son API d'indexation que pour
 * les offres d'emploi et les directs, et a fermé le « ping » de sitemap en
 * 2023 : pour lui, c'est le sitemap déclaré dans la Search Console, avec un
 * lastmod exact par adresse, qui fait le travail.
 *
 * Seulement en production (Railway) : un banc ou un poste local n'annonce
 * jamais rien. `INDEXNOW_AUTO=off` dans Railway le coupe.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { SITE } from './analysesPubliques.js'

/** La même que frontend/scripts/build-geo.cjs, qui pose /<clé>.txt à la racine du site. Publique par construction. */
export const INDEXNOW_KEY = '7c1f4e2ab95d4c0e8f36a1d2b7e90c54'
const HOTE = new URL(SITE).host
const DEJA = path.resolve('storage', 'indexnow-annoncees.json')

/** Les adresses pas encore annoncées, dans l'ordre du sitemap. Pur, pour le banc. */
export function aAnnoncer(sitemap: string, deja: Iterable<string>): string[] {
  const vues = new Set(deja)
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  return [...new Set(locs)].filter((u) => !vues.has(u))
}

async function lireDeja(): Promise<string[]> {
  try {
    const v = JSON.parse(await readFile(DEJA, 'utf8'))
    return Array.isArray(v) ? v.filter((u) => typeof u === 'string') : []
  } catch {
    return []
  }
}

/** Une passe : annonce ce qui est nouveau, mémorise ce qui a été reçu. Rend le nombre d'adresses envoyées. */
export async function annoncerAnalyses(sitemap: string): Promise<number> {
  const deja = await lireDeja()
  const nouvelles = aAnnoncer(sitemap, deja)
  if (!nouvelles.length) {
    console.log('[indexnow] rien de nouveau à annoncer')
    return 0
  }
  // Le moteur vient lire la clé sur le site : si elle n'y est pas, l'annonce serait refusée (403) et le site mal noté.
  const cle = await fetch(`${SITE}/${INDEXNOW_KEY}.txt`)
  if (!cle.ok || (await cle.text()).trim() !== INDEXNOW_KEY) {
    console.error(`[indexnow] clé non servie par ${SITE} (${cle.status}) : rien envoyé`)
    return 0
  }
  const reponse = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOTE, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: nouvelles.slice(0, 10000) }),
  })
  // 200 : reçu. 202 : reçu, clé en cours de vérification. Le reste est un refus, qu'on retentera au prochain démarrage.
  if (reponse.status !== 200 && reponse.status !== 202) {
    console.error(`[indexnow] refus ${reponse.status} : ${(await reponse.text()).slice(0, 200)}`)
    return 0
  }
  await mkdir(path.dirname(DEJA), { recursive: true })
  await writeFile(DEJA, JSON.stringify([...deja, ...nouvelles.slice(0, 10000)]))
  console.log(`[indexnow] ${Math.min(nouvelles.length, 10000)} adresse(s) annoncée(s) (${reponse.status})`)
  return Math.min(nouvelles.length, 10000)
}

/** Sur Railway, sauf INDEXNOW_AUTO=off : un banc ou un poste local n'annonce jamais rien. */
export function enProduction(): boolean {
  return Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT) && process.env.INDEXNOW_AUTO !== 'off'
}

/** Au démarrage, en production seulement, après que Railway a remplacé l'ancien conteneur. */
export function planifierAnnonce(sitemap: () => string, delaiMs = 3 * 60_000): void {
  if (!enProduction()) return
  setTimeout(() => {
    Promise.resolve()
      .then(() => annoncerAnalyses(sitemap()))
      .catch((e) => console.error('[indexnow] annonce impossible', e instanceof Error ? e.message : e))
  }, delaiMs).unref()
}
