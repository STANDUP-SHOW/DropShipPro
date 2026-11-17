/**
 * Banc : réimporter une date déjà importée (max, 17/11/2026 : « les fichiers du 15 et du 16 ont été
 * régénérés vers 19h50 avec de bonnes URL… pour lui, elles sont déjà importées »).
 * Faux Drive servi par un `fetch` remplacé, surcouche temporaire, import en APERÇU : rien n'est écrit.
 *
 *   npx tsx check-reimport-drive.ts
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { importerDossierDrive } from './src/services/importDrive.js'
import { CHEMIN_SURCOUCHE } from './src/services/reportsDb.js'

const etudeLib = createRequire(import.meta.url)('./rapports-etude.cjs')
let echecs = 0
const exige = (ok: unknown, libelle: string) => {
  console.log(`  ${ok ? 'ok   ' : 'ÉCHEC'} ${libelle}`)
  if (!ok) echecs++
}

const D = '2026-11-16'
function rayon(n: number, url: (i: number) => string) {
  const lignes = Array.from({ length: n }, (_, k) => `| ${k + 1} | Produit cheveux ${k + 1} | AliExpress | ${url(k + 1)} | 5€ | 15€ | 66% | api | Bon |`)
  return ['---', 'type: rayon', `date: ${D}`, 'categorie: beaute', 'theme: cheveux', 'titre: Rayon cheveux', '---', '## Analyse', '- Marché.', '## 20 produits proposés',
    '| # | Titre | Fournisseur | URL fournisseur | Prix achat € | Prix vente conseillé € | Marge % | Import | Pourquoi |', '|---|---|---|---|---|---|---|---|---|', ...lignes, ''].join('\n')
}
// The morning copy: 20 addresses (composed, wrong). The evening rewrite: 14 verified, 6 left empty.
const matin = rayon(20, (i) => `https://fr.aliexpress.com/item/10050000${String(i).padStart(5, '0')}.html`)
const soir = rayon(20, (i) => (i > 14 ? '' : `https://fr.aliexpress.com/item/20050000${String(i).padStart(5, '0')}.html`))

type Noeud = { nom: string; enfants?: string[]; texte?: string }
const DRIVE: Record<string, Noeud> = {
  racineBBBBBB: { nom: 'MARKET-ANALYSES', enfants: ['jourBBBBBBB'] },
  jourBBBBBBB: { nom: D, enfants: ['beauteBBBBB'] },
  beauteBBBBB: { nom: 'beaute', enfants: ['matinBBBBBB', 'soirBBBBBBB'] },
  matinBBBBBB: { nom: 'cheveux.rayon.md', texte: matin },
  soirBBBBBBB: { nom: 'cheveux.rayon.md', texte: soir },
  // The same day once the morning copy alone is left (the listing is cached per folder: another tree).
  racineCCCCCC: { nom: 'MARKET-ANALYSES', enfants: ['jourCCCCCCC'] },
  jourCCCCCCC: { nom: D, enfants: ['beauteCCCCC'] },
  beauteCCCCC: { nom: 'beaute', enfants: ['matinBBBBBB'] },
}
globalThis.fetch = (async (entree: string | URL) => {
  const url = new URL(String(entree))
  const id = url.searchParams.get('id') ?? url.pathname.match(/\/d\/([^/]+)/)?.[1] ?? ''
  const n = DRIVE[id]
  if (!n) return new Response('introuvable', { status: 404 })
  if (url.pathname === '/embeddedfolderview') {
    const blocs = (n.enfants ?? []).map((e) => {
      const c = DRIVE[e]
      const lien = c.enfants ? `https://drive.google.com/drive/folders/${e}` : `https://drive.google.com/file/d/${e}/view`
      return `<div class="flip-entry" id="entry-${e}"><a href="${lien}"><div class="flip-entry-title">${c.nom}</div></a></div>`
    })
    return new Response(`<html><head><title>${n.nom} - Google Drive</title></head><body><div class="flip-entries">${blocs.join('')}</div></body></html>`)
  }
  return new Response(n.texte ?? '')
}) as typeof fetch

const idRayon = etudeLib.etudeMarkdown({ texteRayon: matin, texteMarketing: null, origineRayon: 'x', origineMarketing: null }).idRayon
const sauvegarde = fs.existsSync(CHEMIN_SURCOUCHE) ? fs.readFileSync(CHEMIN_SURCOUCHE) : null
fs.mkdirSync(new URL('./storage/', import.meta.url), { recursive: true })
fs.writeFileSync(CHEMIN_SURCOUCHE, JSON.stringify({ etudes: [{ idRayon, format: 'markdown', origine: 'drive:x', importeLe: `${D}T07:00:00Z`, texteRayon: matin, texteMarketing: null }] }))
try {
  const r = await importerDossierDrive('https://drive.google.com/drive/folders/racineBBBBBB', [D], true)
  const gardee = r.lignes.find((l) => l.rayon === 'beaute/cheveux' && l.statut === 'apercu')
  exige(gardee?.urlsDistinctes === 14, `la réécriture du soir (14 adresses) passe devant la copie du matin déjà en ligne (20 adresses) → ${gardee?.urlsDistinctes}`)
  exige(r.lignes.some((l) => l.rayon === 'beaute/cheveux' && l.statut === 'doublon' && l.urlsDistinctes === 20), 'la copie du matin est écartée comme doublon')

  const sansForcer = await importerDossierDrive('https://drive.google.com/drive/folders/racineCCCCCC', [D], true)
  exige(sansForcer.lignes.some((l) => l.statut === 'doublon' && /identique/.test(l.raison ?? '')), 'sans forcer : un fichier identique reste « rien de changé »')
  const forcee = await importerDossierDrive('https://drive.google.com/drive/folders/racineCCCCCC', [D], true, true)
  exige(forcee.lignes.some((l) => l.rayon === 'beaute/cheveux' && l.statut === 'apercu'), 'forcer : même un fichier identique est réimporté (jamais « rien de changé »)')
} finally {
  if (sauvegarde) fs.writeFileSync(CHEMIN_SURCOUCHE, sauvegarde)
  else fs.rmSync(CHEMIN_SURCOUCHE, { force: true })
}

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est conforme.')
process.exit(echecs ? 1 : 0)
