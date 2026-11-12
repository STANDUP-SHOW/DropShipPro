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
process.env.DRIVE_SANS_ATTENTE = "1"
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
  // Google throttling: a page with no file list, twice, then the real view (9-12/11/2026).
  freineAAAAA: { nom: 'rapports', enfants: ['j09AAAAAAAA', 'j10AAAAAAAA'] },
  j09AAAAAAAA: { nom: '2026-11-09', enfants: ['cat09AAAAAA'] },
  cat09AAAAAA: { nom: 'animaux', enfants: ['r09AAAAAAAA'] },
  r09AAAAAAAA: { nom: 'chiens.rayon.md', texte: '## x\n' },
  j10AAAAAAAA: { nom: '2026-11-10', enfants: ['cat10AAAAAA'] },
  cat10AAAAAA: { nom: 'animaux', enfants: ['r10AAAAAAAA'] },
  r10AAAAAAAA: { nom: 'chats.rayon.md', texte: '## x\n' },
  bloqueAAAAA: { nom: 'rapports', enfants: ['jBloqueAAAA'] },
  jBloqueAAAA: { nom: '2026-11-11', enfants: [] },
}
/** Folder ids Google « throttles »: how many more answers without a list each still gives. */
const freins: Record<string, number> = { cat09AAAAAA: 2, jBloqueAAAA: 99 }

const ouverts: string[] = []
globalThis.fetch = (async (entree: string | URL) => {
  const url = new URL(String(entree))
  const id = url.searchParams.get('id') ?? ''
  const n = DRIVE[id]
  if (!n) return new Response('introuvable', { status: 404 })
  if (url.pathname === '/embeddedfolderview') {
    if ((freins[id] ?? 0) > 0) {
      freins[id]--
      return new Response('<html><body>Our systems have detected unusual traffic</body></html>')
    }
    const blocs = (n.enfants ?? []).map((e) => {
      const c = DRIVE[e]
      const lien = c.enfants ? `https://drive.google.com/drive/folders/${e}` : `https://drive.google.com/file/d/${e}/view`
      return `<div class="flip-entry" id="entry-${e}"><a href="${lien}"><div class="flip-entry-title">${c.nom}</div></a></div>`
    })
    return new Response(`<html><head><title>${n.nom} - Google Drive</title></head><body><div class="flip-entries">${blocs.join('')}</div></body></html>`)
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

console.log('Google qui freine (lectures du 9 au 12/11/2026)')
const freine = regrouper(await listerArbre('freineAAAAA'))
exige(freine.map((d) => d.date).join(',') === '2026-11-10,2026-11-09', 'une liste refusée deux fois puis rendue : le jour n’est pas perdu')
exige(freins.cat09AAAAAA === 0, 'le dossier freiné a bien été relu')
const seul = regrouper(await listerArbre('freineAAAAA', (d) => d === '2026-11-10'))
exige(seul.length === 1 && seul[0].date === '2026-11-10', 'import d’une date : les autres dossiers datés ne sont pas lus')
let erreur = ''
try {
  await listerArbre('bloqueAAAAA')
} catch (e) {
  erreur = e instanceof Error ? e.message : String(e)
}
exige(erreur.includes('rapports/2026-11-11') && erreur.includes('freine'), `liste jamais rendue : erreur qui nomme le dossier, pas un dossier vide (« ${erreur.slice(0, 90)}… »)`)

if (echecs) {
  console.log(`\n${echecs} échec(s)`)
  process.exit(1)
}
console.log('\nImport Drive : tout est vert')
