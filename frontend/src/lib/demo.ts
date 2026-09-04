import { useEffect, useState } from 'react'

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

const CLE = 'dsp-demo'
const EVENEMENT = 'dsp-demo-bascule'

export function demoActif(): boolean {
  try {
    return localStorage.getItem(CLE) === '1'
  } catch {
    return false
  }
}

/**
 * Vrai si un choix a déjà été posé — pilule cliquée, ou automatisme du compte
 * vide. Il départage « jamais décidé » (l'automatisme peut choisir) de
 * « coupé exprès » (l'automatisme n'a plus voix au chapitre).
 */
export function demoChoisi(): boolean {
  try {
    return localStorage.getItem(CLE) !== null
  } catch {
    return false
  }
}

export function useDemo(): [boolean, () => void] {
  const [actif, setActif] = useState(demoActif)

  useEffect(() => {
    const relire = () => setActif(demoActif())
    window.addEventListener(EVENEMENT, relire)
    return () => window.removeEventListener(EVENEMENT, relire)
  }, [])

  const basculer = () => poserDemo(!demoActif())

  return [actif, basculer]
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
