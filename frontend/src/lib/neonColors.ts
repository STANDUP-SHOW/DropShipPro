import { useEffect } from 'react'

/**
 * Le néon des blocs, en couleurs VARIÉES — pas un rose uniforme.
 *
 * Les tuiles du tableau de bord s'allument chacune de sa couleur ; le vendeur
 * veut la même variété sur tous les blocs du site (10/09/2026 : « vert, jaune,
 * bleu, rose, orange, violet, bleu ciel — couleurs alternées »). La règle CSS
 * du survol lit `--neon` ; on pose donc une couleur différente par bloc, en
 * tournant sur cette palette, pour que deux blocs voisins ne soient jamais de
 * la même teinte.
 *
 * Les tuiles du dashboard (`data-forme`) gardent LEUR code : elles sont exclues
 * ici comme dans la règle CSS, rien n'y change.
 */
const NEON: string[] = [
  '52, 211, 153', // vert
  '251, 191, 36', // jaune
  '96, 165, 250', // bleu
  '244, 114, 182', // rose
  '251, 146, 60', // orange
  '167, 139, 250', // violet
  '56, 189, 248', // bleu ciel
]

/** Le rang courant : continu d'un passage à l'autre, donc la teinte défile. */
let prochain = 0

function estBloc(el: HTMLElement): boolean {
  const c = el.className
  if (typeof c !== 'string') return false
  if (el.dataset.forme) return false // les tuiles du dashboard gardent leur code
  const tokens = c.split(/\s+/)
  const arrondi =
    tokens.includes('rounded-xl') || tokens.includes('rounded-2xl') || tokens.includes('rounded-3xl')
  if (!arrondi) return false
  if (!c.includes('border')) return false
  return c.includes('bg-white/') || c.includes('backdrop-blur')
}

/** Pose une couleur de néon sur chaque bloc pas encore peint. */
export function peindreNeon() {
  document.querySelectorAll<HTMLElement>('[class*="rounded-"]').forEach((el) => {
    if (el.dataset.neon) return
    if (!estBloc(el)) return
    el.style.setProperty('--neon', NEON[prochain % NEON.length])
    el.dataset.neon = '1'
    prochain++
  })
}

/**
 * Repeint à chaque page, et suit les blocs qui arrivent après coup (les blocs de
 * statistiques chargent leurs données puis se montent). Débounce pour ne pas
 * repasser à chaque micro-mutation.
 */
export function useNeonVarie() {
  useEffect(() => {
    peindreNeon()
    let minuteur: number | undefined
    const observateur = new MutationObserver(() => {
      window.clearTimeout(minuteur)
      minuteur = window.setTimeout(peindreNeon, 120)
    })
    observateur.observe(document.body, { childList: true, subtree: true })
    return () => {
      observateur.disconnect()
      window.clearTimeout(minuteur)
    }
  }, [])
}
