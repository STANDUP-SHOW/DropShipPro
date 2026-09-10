import { useEffect, useState } from 'react'
import { useAuth } from './auth'

/**
 * Le mode DÉMO — un habillage d'écran, jamais des données.
 *
 * Demandé le 06/09/2026 pour le contrôle visuel général de l'application :
 * chaque page à données porte une pilule DÉMO ; activée, la page montre un
 * jeu d'exemple réaliste (messages, commandes, ventes, rapports…) à la place
 * de la liste vide. Rien n'est écrit en base : couper le mode rend les
 * vraies données telles quelles.
 *
 * L'état vit dans localStorage pour survivre à la navigation : on active une
 * fois, on fait le tour de l'appli, on coupe. L'événement maison synchronise
 * les composants d'une même page (la pilule et la liste, par exemple).
 */

// Clé bumpée le 11/09/2026 : l'ancien automatisme du « compte vide » posait ce
// drapeau à '1' tout seul. En changeant de clé, tout état hérité de cet
// automatisme est ignoré — la démo repart éteinte, et seul un clic la lève.
const CLE = 'dsp-demo-2'
const EVENEMENT = 'dsp-demo-bascule'

/**
 * Le seul compte qui possède le mode démo (06/09/2026) : c'est l'outil de
 * démonstration commerciale de Max, pas une fonction du produit. Pour tout
 * autre compte la pilule n'existe pas, et un drapeau posé à la main dans le
 * navigateur ne montre rien.
 */
export const COMPTE_DEMO = 'maxmartinel34@gmail.com'

export function demoAutorise(email: string | null | undefined): boolean {
  return email === COMPTE_DEMO
}

export function demoActif(): boolean {
  try {
    return localStorage.getItem(CLE) === '1'
  } catch {
    return false
  }
}

/**
 * Vrai si la pilule a déjà été cliquée (dans un sens ou l'autre). Sert à
 * reprendre l'état choisi au retour sur le tableau de bord ; sans choix, la
 * démo reste éteinte (plus aucun automatisme ne la lève).
 */
export function demoChoisi(): boolean {
  try {
    return localStorage.getItem(CLE) !== null
  } catch {
    return false
  }
}

export function useDemo(): [boolean, () => void] {
  const [drapeau, setDrapeau] = useState(demoActif)
  const { user } = useAuth()

  useEffect(() => {
    const relire = () => setDrapeau(demoActif())
    window.addEventListener(EVENEMENT, relire)
    return () => window.removeEventListener(EVENEMENT, relire)
  }, [])

  const basculer = () => poserDemo(!demoActif())

  // Le verrou est ICI, au centre : chaque page qui consomme le hook est
  // couverte sans rien savoir du compte.
  return [drapeau && demoAutorise(user?.email), basculer]
}

/** Lève ou abaisse le mode pour tout le site — seul le tableau de bord appelle. */
export function poserDemo(actif: boolean) {
  try {
    localStorage.setItem(CLE, actif ? '1' : '0')
  } catch {
    // Stockage indisponible (navigation privée) : le mode ne tient que la page.
  }
  window.dispatchEvent(new Event(EVENEMENT))
}
