import { useCallback, useEffect, useState } from 'react'

/**
 * Le thème de l'application : sombre (celui d'origine) ou clair.
 *
 * Le choix vit dans localStorage et se pose sur `<html data-theme="light">`.
 * C'est cet attribut que lit `theme-clair.css` pour retourner la palette ;
 * `index.html` le pose aussi avant le premier rendu, sinon la page
 * clignoterait en sombre à chaque chargement.
 */
export type Theme = 'dark' | 'light'

const CLE = 'dsp-theme'

export function lireTheme(): Theme {
  try {
    return localStorage.getItem(CLE) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function appliquerTheme(theme: Theme) {
  const html = document.documentElement
  if (theme === 'light') html.setAttribute('data-theme', 'light')
  else html.removeAttribute('data-theme')
  try {
    localStorage.setItem(CLE, theme)
  } catch {
    // Stockage refusé (navigation privée stricte) : le choix vaut pour la page.
  }
}

/** Le thème courant et la bascule, pour le bouton du menu. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(lireTheme)
  useEffect(() => appliquerTheme(theme), [theme])
  const basculer = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  return [theme, basculer]
}
