import { Logo } from './Logo'

/**
 * Shown while the session is being checked or a page's data is loading.
 *
 * An empty gradient div here reads as a crash — the screen goes dark with nothing
 * on it — so it always carries the logo and a moving indicator.
 */
export function LoadingScreen({ message = 'Chargement…' }: { message?: string }) {
  return (
    <div className="min-h-screen bg-app-gradient flex flex-col items-center justify-center gap-5 text-white">
      <Logo />
      <div className="flex items-center gap-2.5 text-sm text-gray-400">
        <span className="h-4 w-4 rounded-full border-2 border-purple-300/30 border-t-purple-300 animate-spin" />
        {message}
      </div>
    </div>
  )
}
