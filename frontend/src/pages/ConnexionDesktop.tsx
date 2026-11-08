import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { api, isAuthed } from '../lib/api'

/**
 * Sign-in for DropShipper Desktop, opened by the app in the seller's own browser
 * (Google refuses its sign-in inside the app's embedded view).
 *
 * Not signed in: the request is remembered and the seller goes through the normal
 * login page (password or Google); the Protected route of the dashboard sends them
 * back here. Signed in: a two-minute single-use code is requested and handed to
 * the app through dropshipper://connexion — never the session token itself.
 *
 * app=kantix (08/11/2026): same handoff for KANTIX ANALYSER, Max's back-office,
 * through kantix://connexion; it only reads the account's e-mail with it, to
 * name the account that receives the winners of a synthesis.
 */
const CLE = 'connexion_desktop_en_attente'
const ETAT = /^[A-Za-z0-9_-]{16,128}$/
const APPLIS = {
  desktop: { schema: 'dropshipper', nom: 'DropShipper Desktop' },
  kantix: { schema: 'kantix', nom: 'KANTIX ANALYSER' },
} as const

export function connexionDesktopEnAttente(): string | null {
  try {
    return sessionStorage.getItem(CLE)
  } catch {
    return null
  }
}

export default function ConnexionDesktop() {
  const [params] = useSearchParams()
  const etat = params.get('etat') || ''
  const cleAppli = params.get('app') === 'kantix' ? 'kantix' : 'desktop'
  const appli = APPLIS[cleAppli]
  const [lien, setLien] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const connecte = isAuthed()

  useEffect(() => {
    if (connecte) {
      try {
        sessionStorage.removeItem(CLE)
      } catch {
        /* nothing remembered */
      }
    }
    if (!ETAT.test(etat)) {
      setErreur(`Lien incomplet : relancez la connexion depuis l’application ${appli.nom}.`)
      return
    }
    if (!connecte) {
      try {
        sessionStorage.setItem(CLE, new URLSearchParams(cleAppli === 'kantix' ? { etat, app: cleAppli } : { etat }).toString())
      } catch {
        /* storage blocked: the seller can click the app button again after login */
      }
      return
    }
    api
      .codeConnexionDesktop(etat)
      .then(({ code }) => {
        const adresse = `${appli.schema}://connexion?${new URLSearchParams({ code, etat })}`
        setLien(adresse)
        window.location.href = adresse
      })
      .catch((err) => setErreur(err instanceof Error ? err.message : 'Connexion impossible pour le moment.'))
  }, [etat, connecte, cleAppli, appli])

  return (
    <div className="min-h-screen bg-app-gradient text-white flex flex-col items-center justify-center px-6">
      <Link to="/" className="mb-8">
        <Logo />
      </Link>
      <div className="w-full max-w-sm rounded-2xl bg-white/5 border border-white/10 p-6 space-y-4 text-center">
        <h1 className="text-xl font-bold">Connexion de {appli.nom}</h1>
        {erreur ? (
          <p className="text-sm text-red-400">{erreur}</p>
        ) : !connecte ? (
          <>
            <p className="text-sm text-gray-300">
              Connectez-vous à votre compte : l’application se reliera ensuite toute seule.
            </p>
            <Link to="/login" className="btn-gradient block w-full rounded-lg py-2.5 font-semibold">
              Se connecter
            </Link>
          </>
        ) : lien ? (
          <>
            <p className="text-sm text-gray-300">
              Autorisez l’ouverture de {appli.nom} si le navigateur le demande. Vous pouvez ensuite fermer cet
              onglet.
            </p>
            <a href={lien} className="btn-gradient block w-full rounded-lg py-2.5 font-semibold">
              Ouvrir {appli.nom}
            </a>
          </>
        ) : (
          <p className="text-sm text-gray-300">Préparation de la connexion…</p>
        )}
      </div>
    </div>
  )
}
