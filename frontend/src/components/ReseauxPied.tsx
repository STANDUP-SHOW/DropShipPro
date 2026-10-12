import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import icones from '../data/icones-reseaux.json'

/**
 * DropShipper's social icons in the public footer (Max, 12/10/2026). The links
 * are set from the Poste d'analyses (PUT /api/admin/reseaux-sociaux); an
 * account with no link shows no icon, so the row stays empty until Max fills
 * it in — never a dead link. Same rule as the static pages (scripts/pied-de-page.cjs).
 */
export function ReseauxPied() {
  const [liens, setLiens] = useState<Record<string, string | null>>({})

  useEffect(() => {
    api
      .reseauxSociaux()
      .then((r) => setLiens(r.reseaux ?? {}))
      .catch(() => {
        // An unreachable API leaves the footer without icons, nothing more.
      })
  }, [])

  const visibles = icones.reseaux.filter((r) => typeof liens[r.id] === 'string' && liens[r.id])
  if (!visibles.length) return null
  return (
    <ul aria-label="DropShipper sur les réseaux" className="flex flex-wrap items-center gap-3">
      {visibles.map((r) => (
        <li key={r.id}>
          <a
            href={liens[r.id]!}
            target="_blank"
            rel="noopener"
            aria-label={`DropShipper sur ${r.label}`}
            title={r.label}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--trait)] bg-[var(--panneau)] text-[var(--texte-2)] transition hover:border-[var(--rose)] hover:text-[var(--texte)]"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d={r.d} />
            </svg>
          </a>
        </li>
      ))}
    </ul>
  )
}
