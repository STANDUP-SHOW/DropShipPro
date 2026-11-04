/**
 * Banc de l'import Google Drive (back-office) : un faux Drive en mémoire,
 * servi par un `fetch` remplacé. Aucun réseau, aucune base.
 *
 *   npx tsx check-import-drive.ts
 *
 * Vérifie : le nom du dossier collé compte dans le chemin (un dossier daté
 * collé seul se lit), les sous-dossiers sont lus, un rapport sans dossier daté
 * prend la date écrite dans son en-tête ou son bloc « study », et ce qui reste
 * sans date est nommé au lieu de disparaître.
 */
import { daterSansDossier, listerArbre, nomDossierVue, regrouper } from './src/services/importDrive.js'

let echecs = 0
function exige(ok: unknown, libelle: string) {
  if (ok) console.log(`  ok  ${libelle}`)
  else {
    echecs++
    console.log(`  ÉCHEC  ${libelle}`)
  }
}

type Noeud = { nom: string; enfants?: string[]; texte?: string }
const DRIVE: Record<string, Noeud> = {
  racineAAAAAA: { nom: 'MARKET-ANALYSES', enfants: ['jourAAAAAAA', 'promptsAAAA'] },
  promptsAAAA: { nom: 'prompts', enfants: ['notePromptA'] },
  notePromptA: { nom: 'rayon.txt', texte: 'x' },
  jourAAAAAAA: { nom: '2026-11-03', enfants: ['teleAAAAAAA'] },
  teleAAAAAAA: { nom: 'telephonie', enfants: ['smartRayonA', 'smartMktAAA'] },
  smartRayonA: { nom: 'smartphones.rayon.md', texte: '## Téléphonie — Smartphones\n' },
  smartMktAAA: { nom: 'smartphones.marketing.md', texte: '## Social places\n' },
  // A category folder pasted on its own: no date above it.
  plateAAAAAA: { nom: 'objets-connectes', enfants: ['montreRayon', 'montreMktAA', 'braceletJsn', 'sansEnTete'] },
  montreRayon: { nom: 'montres.rayon.md', texte: '---\ndate: 2026-11-02\ncategorie: Objets connectés\ntheme: montres\n---\n## Analyse\n' },
  montreMktAA: { nom: 'montres.marketing.md', texte: '## Social places\n' },
  braceletJsn: { nom: 'bracelets.json', texte: JSON.stringify({ study: { date: '2026-11-01', category_id: 'objets-connectes', category_name: 'Objets connectés', theme_slug: 'bracelets' } }) },
  sansEnTete: { nom: 'bagues.rayon.md', texte: '## Bagues\n' },
}

const ouverts: string[] = []
globalThis.fetch = (async (entree: string | URL) => {
  const url = new URL(String(entree))
  const id = url.searchParams.get('id') ?? ''
  const n = DRIVE[id]
  if (!n) return new Response('introuvable', { status: 404 })
  if (url.pathname === '/embeddedfolderview') {
    const blocs = (n.enfants ?? []).map((e) => {
      const c = DRIVE[e]
      const lien = c.enfants ? `https://drive.google.com/drive/folders/${e}` : `https://drive.google.com/file/d/${e}/view`
      return `<div class="flip-entry" id="entry-${e}"><a href="${lien}"><div class="flip-entry-title">${c.nom}</div></a></div>`
    })
    return new Response(`<html><head><title>${n.nom} - Google Drive</title></head><body>${blocs.join('')}</body></html>`)
  }
  ouverts.push(id)
  return new Response(n.texte ?? '')
}) as typeof fetch

console.log('Nom du dossier lu dans la vue embarquée')
exige(nomDossierVue('<title>2026-11-03 - Google Drive</title>') === '2026-11-03', '« 2026-11-03 - Google Drive » → 2026-11-03')
exige(nomDossierVue('<title>2026-11-03</title>') === '2026-11-03', 'titre nu gardé')
exige(nomDossierVue('<html></html>') === '', 'pas de titre → vide')

console.log('Dossier parent collé : sous-dossiers lus, prompts/ ignoré')
const parent = regrouper(await listerArbre('racineAAAAAA'))
exige(parent.length === 1 && parent[0].date === '2026-11-03', 'une date trouvée')
exige(parent[0].etudes.length === 1 && parent[0].etudes[0].categorie === 'telephonie' && !!parent[0].etudes[0].marketing, 'telephonie/smartphones avec son marketing')

console.log('Dossier daté collé seul')
const jour = regrouper(await listerArbre('jourAAAAAAA'))
exige(jour.length === 1 && jour[0].date === '2026-11-03' && jour[0].etudes[0]?.theme === 'smartphones', 'mêmes études qu’en collant le parent')

console.log('Dossier de catégorie collé seul (aucun dossier daté)')
const arbre = await listerArbre('plateAAAAAA')
const { fichiers, sansDate } = await daterSansDossier(arbre)
const dates = regrouper(fichiers)
const montres = dates.find((d) => d.date === '2026-11-02')?.etudes[0]
exige(montres?.categorie === 'objets-connectes' && montres.theme === 'montres', 'montres placé par son en-tête (2026-11-02, objets-connectes)')
exige(!!montres?.marketing, 'son .marketing.md le suit')
const bracelets = dates.find((d) => d.date === '2026-11-01')?.etudes[0]
exige(bracelets?.categorie === 'objets-connectes' && !!bracelets.json, 'bracelets.json placé par son bloc study')
exige(sansDate.length === 1 && sansDate[0].endsWith('bagues.rayon.md'), 'bagues (ni dossier daté ni en-tête) nommé dans sansDate')
exige(!ouverts.includes('montreMktAA'), 'un .marketing.md n’est pas ouvert pour être daté')

if (echecs) {
  console.log(`\n${echecs} échec(s)`)
  process.exit(1)
}
console.log('\nImport Drive : tout est vert')
