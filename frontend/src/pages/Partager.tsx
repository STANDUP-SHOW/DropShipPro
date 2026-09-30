import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, isAuthed } from '../lib/api'

/**
 * La cible du menu « Partager » du téléphone (Web Share Target, voir
 * public/manifest.webmanifest) : Android envoie ici le titre, le texte et
 * l'adresse partagés. Le produit rejoint la liste à importer — la même que
 * celle de l'application mobile et du desktop — et l'application desktop
 * l'importe.
 *
 * Sans session, la page de connexion garde les paramètres : au retour, le
 * partage part quand même.
 */
export default function Partager() {
  const { search } = useLocation()
  const [etat, setEtat] = useState<{ statut: 'envoi' | 'ok' | 'erreur'; message: string }>({ statut: 'envoi', message: 'Envoi du produit…' })

  useEffect(() => {
    const p = new URLSearchParams(search)
    if (!isAuthed()) {
      // Pas de session : le partage attend la connexion (voir Protected dans App.tsx), puis repart tout seul.
      try {
        sessionStorage.setItem('partage_en_attente', p.toString())
      } catch {
        /* stockage indisponible : le vendeur repartagera */
      }
      setEtat({ statut: 'erreur', message: 'Connectez-vous : le produit partira dans votre liste juste après.' })
      return
    }
    try {
      sessionStorage.removeItem('partage_en_attente')
    } catch {
      /* rien à retirer */
    }
    const url = (p.get('url') || '').trim()
    const text = (p.get('text') || '').trim()
    const title = (p.get('title') || '').trim()
    if (!url && !text) {
      setEtat({ statut: 'erreur', message: 'Aucun lien reçu. Depuis la fiche d’un produit, touchez « Partager » puis « DropShipper IA ».' })
      return
    }
    api
      .partagerProduit({ url: url || undefined, text: [title, text].filter(Boolean).join(' ') || undefined })
      .then((r) => setEtat({ statut: 'ok', message: r.message || 'Produit envoyé dans votre liste à importer.' }))
      .catch((err) => setEtat({ statut: 'erreur', message: err instanceof Error ? err.message : 'Envoi impossible.' }))
  }, [search])

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <img src="/marque/dropshipper-icone.png" alt="" className="h-16 w-16 rounded-2xl" />
      <h1 className="text-xl font-bold">{etat.statut === 'ok' ? 'C’est dans la liste' : etat.statut === 'erreur' ? 'Partage impossible' : 'Un instant'}</h1>
      <p className="text-gray-300">{etat.message}</p>
      {etat.statut === 'ok' ? (
        <p className="text-sm text-gray-500">Votre application desktop l’importe et le publie ; sinon, « Importer » dans Produits partagés.</p>
      ) : null}
      <Link to={isAuthed() ? '/dashboard' : '/login'} className="btn-gradient rounded-xl px-4 py-2 text-sm font-semibold text-white">
        {isAuthed() ? 'Ouvrir mon tableau de bord' : 'Me connecter'}
      </Link>
    </main>
  )
}
