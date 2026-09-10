import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/**
 * Bouton « Continuer avec Google » (Google Identity Services).
 *
 * Rien ne s'affiche tant que VITE_GOOGLE_CLIENT_ID n'est pas défini : la page
 * de connexion reste donc parfaitement utilisable avant que la variable soit
 * posée sur Vercel, et le bouton apparaît tout seul une fois le redéploiement
 * fait. (Vite fige les VITE_* à la compilation — cf. lib/api.ts.)
 *
 * GIS renvoie un ID token signé par Google (response.credential), PAS notre
 * jeton applicatif : on le POST au backend (/auth/google), qui le vérifie et
 * rend le vrai jeton — c'est celui-là que le contexte d'auth stocke.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const GSI_SRC = 'https://accounts.google.com/gsi/client'

interface GoogleIdApi {
  initialize: (config: {
    client_id: string
    callback: (response: { credential: string }) => void
  }) => void
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } }
  }
}

export function GoogleSignIn() {
  const { loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const boite = useRef<HTMLDivElement>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!CLIENT_ID) return
    let annule = false

    const afficher = () => {
      if (annule || !window.google || !boite.current) return
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response) => {
          loginWithGoogle(response.credential)
            .then(() => navigate('/dashboard'))
            .catch((err) =>
              setErreur(err instanceof Error ? err.message : 'Connexion Google impossible'),
            )
        },
      })
      window.google.accounts.id.renderButton(boite.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        logo_alignment: 'center',
        width: 320,
        locale: 'fr',
      })
    }

    if (window.google?.accounts?.id) {
      afficher()
      return () => {
        annule = true
      }
    }

    // Charge le script GIS une seule fois, même si les deux pages le montent.
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`)
    const injecte = !script
    if (!script) {
      script = document.createElement('script')
      script.src = GSI_SRC
      script.async = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', afficher)
    // Si le script était déjà chargé mais l'objet pas encore prêt, retente.
    if (!injecte) afficher()

    return () => {
      annule = true
      script?.removeEventListener('load', afficher)
    }
  }, [loginWithGoogle, navigate])

  if (!CLIENT_ID) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="h-px flex-1 bg-white/10" />
        <span>ou</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div ref={boite} className="flex justify-center" />
      {erreur && <p className="text-sm text-red-400 text-center">{erreur}</p>}
    </div>
  )
}
