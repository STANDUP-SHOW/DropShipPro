import { useEffect } from 'react'

/**
 * Les pages publiques (accueil, API Power) sont dessinées pour le noir : leurs
 * fonds sont écrits en dur et le thème clair ne les retourne pas. Un visiteur
 * qui a choisi le thème clair dans l'application y voyait donc des textes
 * sombres sur des blocs sombres — « je ne vois plus aucun texte » (Max,
 * 25/09/2026). Ces pages posent le thème sombre le temps de leur affichage et
 * rendent le réglage du visiteur en partant.
 */
export function useThemeSombreForce() {
  useEffect(() => {
    const html = document.documentElement
    const avant = html.getAttribute('data-theme')
    html.setAttribute('data-theme', 'dark')
    return () => {
      if (avant === null) html.removeAttribute('data-theme')
      else html.setAttribute('data-theme', avant)
    }
  }, [])
}
