import path from 'path'
import { fileURLToPath } from 'url'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'

/**
 * DropShipper's own social accounts, shown as icons in the public footer
 * (Max, 12/10/2026). Set from the Poste d'analyses only (admin key), read by
 * everyone. An empty slot shows no icon: a link to an account that does not
 * exist would be worse than no link.
 *
 * Stored as a small JSON file on the Railway volume (storage/), so no schema
 * change. Path resolved from the module, never from the cwd (src/ under tsx
 * and dist/ must land on the same file).
 */
const RACINE_BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const CHEMIN_RESEAUX = path.join(RACINE_BACKEND, 'storage', 'reseaux-sociaux.json')

/** Display order of the footer icons. */
export const RESEAUX = ['facebook', 'instagram', 'whatsapp', 'x', 'linkedin', 'snapchat'] as const
export type Reseau = (typeof RESEAUX)[number]
export type LiensReseaux = Record<Reseau, string | null>

/** Hosts accepted per network: a pasted link to another site is refused, not shown. */
const HOTES: Record<Reseau, string[]> = {
  facebook: ['facebook.com', 'fb.com', 'fb.me'],
  instagram: ['instagram.com'],
  whatsapp: ['wa.me', 'whatsapp.com'],
  x: ['x.com', 'twitter.com'],
  linkedin: ['linkedin.com'],
  snapchat: ['snapchat.com'],
}

export class LienRefuse extends Error {}

function vide(): LiensReseaux {
  return Object.fromEntries(RESEAUX.map((r) => [r, null])) as LiensReseaux
}

/** Normalizes one link: null/'' clears it; anything else must be https on the network's host. */
export function normaliser(reseau: Reseau, valeur: unknown): string | null {
  if (valeur === null || valeur === undefined) return null
  if (typeof valeur !== 'string') throw new LienRefuse(`${reseau} : le lien doit être un texte.`)
  const brut = valeur.trim()
  if (!brut) return null
  let url: URL
  try {
    url = new URL(brut)
  } catch {
    throw new LienRefuse(`${reseau} : « ${brut.slice(0, 80)} » n'est pas une adresse web.`)
  }
  if (url.protocol !== 'https:') throw new LienRefuse(`${reseau} : l'adresse doit commencer par https://.`)
  const hote = url.hostname.toLowerCase()
  if (!HOTES[reseau].some((h) => hote === h || hote.endsWith(`.${h}`))) {
    throw new LienRefuse(`${reseau} : l'adresse doit être sur ${HOTES[reseau].join(' ou ')}.`)
  }
  if (url.href.length > 300) throw new LienRefuse(`${reseau} : adresse trop longue.`)
  return url.href
}

export async function lireReseaux(chemin = CHEMIN_RESEAUX): Promise<LiensReseaux> {
  const liens = vide()
  let brut: string
  try {
    brut = await readFile(chemin, 'utf8')
  } catch {
    return liens
  }
  try {
    const donnees = JSON.parse(brut) as Record<string, unknown>
    for (const r of RESEAUX) {
      try {
        liens[r] = normaliser(r, donnees[r])
      } catch {
        liens[r] = null
      }
    }
  } catch {
    // A corrupt file shows no icon rather than breaking the footer.
  }
  return liens
}

/** Merges the given slots into the stored ones. Unknown keys are refused. */
export async function ecrireReseaux(maj: Record<string, unknown>, chemin = CHEMIN_RESEAUX): Promise<LiensReseaux> {
  const inconnus = Object.keys(maj).filter((k) => !(RESEAUX as readonly string[]).includes(k))
  if (inconnus.length) throw new LienRefuse(`Réseau inconnu : ${inconnus.join(', ')}. Attendus : ${RESEAUX.join(', ')}.`)
  const liens = await lireReseaux(chemin)
  for (const r of RESEAUX) if (r in maj) liens[r] = normaliser(r, maj[r])
  await mkdir(path.dirname(chemin), { recursive: true })
  const tmp = `${chemin}.tmp`
  await writeFile(tmp, JSON.stringify(liens, null, 2))
  await rename(tmp, chemin)
  return liens
}
