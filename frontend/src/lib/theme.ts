import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

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

/**
 * Les pages du site public (accueil, API Power, connexion, inscription, avis…)
 * n'ont qu'un rendu : sombre, quel que soit le réglage choisi dans le tableau
 * de bord (Max, 25/09 puis 03/10/2026 : « jamais blanc »). Le choix clair /
 * sombre ne vaut que pour les écrans de l'application.
 *
 * Même liste dans le script de tête de `index.html`, qui pose le thème avant
 * le premier rendu : les deux doivent rester d'accord.
 */
const PAGES_PUBLIQUES = [
  '/',
  '/api-power',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/confidentialite',
  '/avis',
  '/partager',
  '/newsletter',
]

export function estPagePublique(chemin: string): boolean {
  const c = chemin.length > 1 ? chemin.replace(/\/+$/, '') : chemin
  return PAGES_PUBLIQUES.includes(c)
}

function poserAttribut(theme: Theme) {
  const html = document.documentElement
  // Hors de l'application, le clair n'est jamais posé.
  if (theme === 'light' && !estPagePublique(location.pathname)) html.setAttribute('data-theme', 'light')
  else html.removeAttribute('data-theme')
}

export function appliquerTheme(theme: Theme) {
  poserAttribut(theme)
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

/**
 * Posé une fois sous le routeur : à chaque changement d'adresse, le thème de
 * la page qui s'affiche. Une page publique rouvre donc en sombre même quand on
 * y arrive depuis le tableau de bord passé en clair, sans recharger.
 */
export function useThemeSelonPage() {
  const { pathname } = useLocation()
  useEffect(() => poserAttribut(lireTheme()), [pathname])
}
