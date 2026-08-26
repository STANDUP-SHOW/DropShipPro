import { useEffect, useState } from 'react'
import { ShieldCheck, AlertTriangle, Ban, Type } from 'lucide-react'
import { api } from '../lib/api'

type Data = Awaited<ReturnType<typeof api.conformite>>

/**
 * Ce que chaque destination acceptera, avant de cliquer sur Diffuser.
 *
 * Deux choses que le vendeur découvrait autrement dans le back-office de la
 * place de marché, sans savoir quoi corriger :
 *
 * — les écarts bloquants, qui font refuser l'annonce ;
 * — le titre réellement envoyé. Aucun titre unique ne convient partout :
 *   Amazon en accepte deux cents et en veut soixante pour le référencement,
 *   Leboncoin coupe à cinquante. L'annonce part donc avec un titre par canal,
 *   raccourci par mots entiers, et le vendeur voit lequel.
 */
export function ChannelReadiness({ productId }: { productId: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [ouvert, setOuvert] = useState(false)

  useEffect(() => {
    api.conformite(productId).then(setData).catch(() => undefined)
  }, [productId])

  if (!data) return null

  const bloquees = data.verdicts.filter((v) => !v.publiable)
  const raccourcis = data.titres.filter((t) => t.raccourci)

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <header className="flex items-start gap-2.5">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-purple-300" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-wide">Prête pour quelles destinations ?</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            {`${data.publiables} destination(s) sur ${data.total} accepteraient cette annonce en l'état.`}
          </p>
        </div>
      </header>

      {bloquees.length ? (
        <div className="mt-3 space-y-2">
          {bloquees.slice(0, ouvert ? bloquees.length : 3).map((v) => (
            <div key={v.platform} className="rounded-xl border border-red-400/25 bg-red-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-red-300">
                <Ban size={11} />
                <span>{v.platform}</span>
              </p>
              {v.ecarts
                .filter((e) => e.severite === 'bloquant')
                .map((e) => (
                  <p key={e.regle} className="mt-1 text-[11px] leading-relaxed text-red-100">
                    {e.message}
                  </p>
                ))}
            </div>
          ))}
          {bloquees.length > 3 ? (
            <button
              type="button"
              onClick={() => setOuvert((v) => !v)}
              className="text-[11px] text-purple-300 underline"
            >
              {ouvert ? 'Réduire' : `Voir les ${bloquees.length - 3} autres`}
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-3 text-xs text-emerald-200">
          Aucun blocage : toutes les destinations connues acceptent cette annonce.
        </p>
      )}

      {/* Les avertissements ne bloquent pas, mais ils coûtent des ventes. */}
      {(() => {
        const avertissements = new Map<string, string>()
        for (const v of data.verdicts) {
          for (const e of v.ecarts) {
            if (e.severite === 'avertissement') avertissements.set(e.regle, e.message)
          }
        }
        return avertissements.size ? (
          <div className="mt-3 space-y-1">
            {[...avertissements.values()].map((message) => (
              <p key={message} className="flex gap-1.5 text-[11px] leading-relaxed text-amber-200">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                <span>{message}</span>
              </p>
            ))}
          </div>
        ) : null
      })()}

      {raccourcis.length ? (
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Type size={12} className="text-purple-300" />
            <span>Titre adapté sur {raccourcis.length} destination(s)</span>
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
            Chacune a sa limite. Le titre est raccourci par mots entiers, jamais coupé au milieu
            d'un mot — c'est là que se perd le mot-clé qui fait vendre.
          </p>
          <ul className="mt-2 space-y-1.5">
            {raccourcis.map((t) => (
              <li key={t.platform} className="rounded-lg bg-black/25 px-3 py-2">
                <p className="flex items-baseline justify-between gap-2 text-[11px]">
                  <span className="font-medium text-gray-300">{t.platform}</span>
                  <span className="shrink-0 tabular-nums text-gray-500">
                    {`${t.titre.length} / ${t.max}`}
                  </span>
                </p>
                <p className="mt-0.5 text-xs leading-snug text-gray-200">{t.titre}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
