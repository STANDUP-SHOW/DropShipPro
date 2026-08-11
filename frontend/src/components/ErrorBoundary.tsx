import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Logo } from './Logo'

/**
 * Catches a render crash and shows what happened.
 *
 * Without it React unmounts the whole tree on any thrown error, leaving the dark
 * background and nothing else — the "black page" that gives the user no idea what
 * broke and nothing to report back.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Plantage de l\'interface :', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen bg-app-gradient flex flex-col items-center justify-center px-6 text-white">
        <Logo />

        <div className="mt-8 w-full max-w-lg rounded-2xl border border-red-400/30 bg-red-500/10 p-6">
          <h1 className="text-lg font-bold">Une erreur a interrompu l'affichage</h1>
          <p className="mt-2 text-sm text-gray-300">
            Vos données ne sont pas perdues : le problème est dans l'affichage, pas dans votre
            catalogue.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-red-200">
            {error.message}
          </pre>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              onClick={() => window.location.reload()}
              className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold"
            >
              Recharger la page
            </button>
            <a
              href="/dashboard"
              className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
            >
              Retour à mes annonces
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(`${error.message}\n\n${error.stack ?? ''}`)}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
            >
              Copier le détail
            </button>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            Le bouton « Copier le détail » met l'erreur complète dans votre presse-papier :
            transmettez-la pour un diagnostic immédiat.
          </p>
        </div>
      </div>
    )
  }
}
