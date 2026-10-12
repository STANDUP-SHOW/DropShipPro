/**
 * Banc : comptes sociaux du pied de page (services/reseauxSociaux.ts).
 * Aucune base : un fichier temporaire tient lieu de storage/reseaux-sociaux.json.
 */
import os from 'os'
import path from 'path'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { LienRefuse, ecrireReseaux, lireReseaux, normaliser } from './src/services/reseauxSociaux.js'

let echecs = 0
function exige(condition: boolean, nom: string, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}
function refuse(f: () => unknown): boolean {
  try {
    f()
    return false
  } catch (e) {
    return e instanceof LienRefuse
  }
}

const dossier = await mkdtemp(path.join(os.tmpdir(), 'reseaux-'))
const chemin = path.join(dossier, 'reseaux-sociaux.json')
try {
  console.log('Les liens acceptés et refusés')
  exige(normaliser('instagram', 'https://www.instagram.com/dropshipper') === 'https://www.instagram.com/dropshipper', 'Instagram en https')
  exige(normaliser('x', 'https://twitter.com/dropshipper') !== null, 'X accepte encore twitter.com')
  exige(normaliser('whatsapp', 'https://wa.me/33746476968') !== null, 'WhatsApp par wa.me')
  exige(normaliser('facebook', '  ') === null && normaliser('facebook', null) === null, 'vide ou null retire le lien')
  exige(refuse(() => normaliser('facebook', 'http://facebook.com/x')), 'http refusé')
  exige(refuse(() => normaliser('linkedin', 'https://evil.com/linkedin.com')), 'autre site refusé')
  exige(refuse(() => normaliser('snapchat', 'https://snapchat.com.evil.io/x')), 'faux sous-domaine refusé')
  exige(refuse(() => normaliser('instagram', 'javascript:alert(1)')), 'javascript: refusé')

  console.log('Lecture et écriture')
  const neuf = await lireReseaux(chemin)
  exige(Object.values(neuf).every((v) => v === null) && Object.keys(neuf).length === 6, 'fichier absent : six emplacements vides')
  await ecrireReseaux({ instagram: 'https://instagram.com/dropshipper' }, chemin)
  await ecrireReseaux({ linkedin: 'https://www.linkedin.com/company/dropshipper' }, chemin)
  const deux = await lireReseaux(chemin)
  exige(deux.instagram !== null && deux.linkedin !== null && deux.facebook === null, 'les écritures se fusionnent')
  await ecrireReseaux({ instagram: '' }, chemin)
  exige((await lireReseaux(chemin)).instagram === null, 'une valeur vide retire l’icône')
  let inconnu = false
  try {
    await ecrireReseaux({ tiktok: 'https://tiktok.com/@x' }, chemin)
  } catch (e) {
    inconnu = e instanceof LienRefuse
  }
  exige(inconnu, 'réseau inconnu refusé')
  await writeFile(chemin, '{pas du json')
  exige(Object.values(await lireReseaux(chemin)).every((v) => v === null), 'fichier corrompu : aucune icône, pas de panne')
} finally {
  await rm(dossier, { recursive: true, force: true })
}

console.log(echecs ? `\n${echecs} échec(s)` : '\nTout est conforme.')
process.exit(echecs ? 1 : 0)
