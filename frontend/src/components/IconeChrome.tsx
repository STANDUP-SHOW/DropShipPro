/**
 * Le logo de Chrome, pour l'entrée « Extension Chrome » du menu (demande de
 * Max du 13/10/2026 : « pour Extension Chrome, mettre l'icône de Google »).
 *
 * Dessiné plutôt que téléversé, comme le sac de Shopify : trois secteurs aux
 * couleurs de Google, l'anneau blanc et la pastille bleue. Net à 16 px, sur
 * fond sombre comme sur fond clair.
 */
export function IconeChrome({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <path d="M24 24 4.95 13A22 22 0 0 1 43.05 13Z" fill="#EA4335" />
      <path d="M24 24 43.05 13A22 22 0 0 1 24 46Z" fill="#FBBC05" />
      <path d="M24 24 24 46A22 22 0 0 1 4.95 13Z" fill="#34A853" />
      <circle cx="24" cy="24" r="10" fill="#fff" />
      <circle cx="24" cy="24" r="7.8" fill="#4285F4" />
    </svg>
  )
}
