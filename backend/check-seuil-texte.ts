/**
 * Banc : l'extension et le serveur jugent le texte relevé avec LE MÊME seuil.
 *
 * 21/11/2026 : l'extension relisait une fiche AliExpress si elle faisait moins
 * de 2 500 caractères, le serveur refusait sous trente mots utiles hors titre.
 * Une fiche bavarde mais creuse passait l'un et échouait à l'autre, et
 * l'annonce sortait « non réécrite ». `substanceSuffisante` (capture.js) est
 * une copie de `substanceSource` (sourceQuality.ts) : ce banc les confronte,
 * en extrayant la copie du fichier livré, pas d'une recopie.
 */
import fs from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { substanceSource } from './src/services/sourceQuality.js'

const ici = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.join(ici, 'extension', 'content', 'capture.js'), 'utf8')
const debut = source.indexOf('  const MOTS_VIDES_SERVEUR')
const fin = source.indexOf('  self.__dspSubstanceSuffisante')
if (debut < 0 || fin < 0) throw new Error('substanceSuffisante introuvable dans capture.js')
const contexte: Record<string, unknown> = {}
vm.runInNewContext(`${source.slice(debut, fin)}\nthis.juger = substanceSuffisante`, contexte)
const juger = contexte.juger as (p: { title: string; description: string; pageText: string }) => boolean

const mots = (n: number, prefixe: string) => Array.from({ length: n }, (_, i) => `${prefixe}${String.fromCharCode(97 + (i % 26))}${Math.floor(i / 26)}x`).join(' ')
const cas: Array<{ nom: string; title: string; description: string; pageText: string }> = [
  { nom: 'page vide', title: 'Montre automatique homme', description: '', pageText: '' },
  { nom: 'accroche Temu seule', title: 'Montre automatique homme', description: 'Trouvez des offres incroyables sur Montre automatique homme sur Temu. Magasinez sur Temu pour économiser.', pageText: 'Connexion Panier Aide' },
  { nom: 'mobilier du site seulement (bavard mais creux)', title: 'Montre automatique homme', description: '', pageText: 'Connexion Panier Aide cookies accepter refuser paramètres livraison gratuite promo soldes remise '.repeat(80) },
  { nom: '29 mots utiles', title: 'Montre', description: '', pageText: mots(29, 'mot') },
  { nom: '30 mots utiles', title: 'Montre', description: '', pageText: mots(30, 'mot') },
  { nom: 'vraie description', title: 'Montre automatique homme', description: 'Montre mécanique à remontage automatique, boîtier protégé par un verre minéral durci, lunette unidirectionnelle, bracelet acier inoxydable 316L, étanchéité 10 ATM, réserve de marche quarante heures.', pageText: '' },
  { nom: 'description courte réelle', title: 'Casque bluetooth', description: 'Autonomie quarante heures, réduction active du bruit, charge rapide USB-C, pliable.', pageText: '' },
]

let echecs = 0
for (const c of cas) {
  const serveur = substanceSource(c).assezPourEcrire
  const extension = juger(c)
  const ok = serveur === extension
  if (!ok) echecs++
  console.log(`${ok ? 'ok  ' : 'FAUX'}  ${c.nom} — serveur ${serveur ? 'accepte' : 'refuse'}, extension ${extension ? 'accepte' : 'refuse'}`)
}
console.log(echecs ? `\n${echecs} désaccord(s).` : '\nSeuil du texte : extension et serveur d’accord.')
process.exit(echecs ? 1 : 0)
