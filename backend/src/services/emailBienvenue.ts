import path from 'path'
import { fileURLToPath } from 'url'
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises'

/**
 * Welcome e-mail imported as finished HTML from Kantix (12/11/2026).
 *
 * Kept as a small JSON file on the Railway volume (storage/), no schema change.
 * The confirmation link is what makes the account usable, so the template MUST
 * carry {{lien_confirmation}}; without a template the built-in message is sent.
 */
const RACINE_BACKEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const CHEMIN_BIENVENUE = path.join(RACINE_BACKEND, 'storage', 'emails', 'bienvenue.json')
export const MARQUE_CONFIRMATION = '{{lien_confirmation}}'

export interface ModeleBienvenue { sujet: string; html: string; majAt: string }

export class ModeleRefuse extends Error {}

export async function lireBienvenue(chemin = CHEMIN_BIENVENUE): Promise<ModeleBienvenue | null> {
  try {
    const m = JSON.parse(await readFile(chemin, 'utf8')) as ModeleBienvenue
    return m && typeof m.html === 'string' && m.html.includes(MARQUE_CONFIRMATION) && typeof m.sujet === 'string' ? m : null
  } catch {
    return null
  }
}

export async function ecrireBienvenue(sujet: unknown, html: unknown, chemin = CHEMIN_BIENVENUE): Promise<ModeleBienvenue> {
  const s = String(sujet ?? '').trim().slice(0, 200)
  const h = String(html ?? '')
  if (!s) throw new ModeleRefuse('Il faut un objet.')
  if (h.trim().length < 20) throw new ModeleRefuse('Le fichier HTML est vide.')
  if (h.length > 1_800_000) throw new ModeleRefuse('Le fichier HTML est trop lourd (1,8 Mo au plus).')
  if (!h.includes(MARQUE_CONFIRMATION)) throw new ModeleRefuse(`Le fichier doit contenir ${MARQUE_CONFIRMATION} à l’endroit du bouton « Confirmer mon adresse » : sans ce lien, le nouveau compte ne peut pas être activé.`)
  const m: ModeleBienvenue = { sujet: s, html: h, majAt: new Date().toISOString() }
  await mkdir(path.dirname(chemin), { recursive: true })
  const tmp = `${chemin}.tmp`
  await writeFile(tmp, JSON.stringify(m))
  await rename(tmp, chemin)
  return m
}

export async function effacerBienvenue(chemin = CHEMIN_BIENVENUE): Promise<void> {
  await unlink(chemin).catch(() => {})
}

/** Plain text of an HTML e-mail (a message without one lands in spam far more often). */
export function texteDeHtml(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n[ \n]*/g, '\n\n')
    .trim()
}
