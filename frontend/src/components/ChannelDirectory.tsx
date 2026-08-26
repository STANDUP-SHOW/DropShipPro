import { useEffect, useMemo, useState } from 'react'
import { Search, Check, Send, X } from 'lucide-react'
import { api } from '../lib/api'

type Data = Awaited<ReturnType<typeof api.listChannels>>
type Canal = Data['canaux'][number]

/**
 * L'annuaire complet des canaux connus.
 *
 * On ne se ferme à personne : tout ce dont nous avons le logo est montré, y
 * compris ce que nous ne savons pas encore servir. Un vendeur qui ne trouve
 * pas sa plateforme repart ; un vendeur qui la trouve, même marquée « pas
 * encore reliée », clique sur « Je veux celle-là » — et c'est ce clic qui nous
 * dit quoi coder ensuite.
 *
 * Ce que l'annuaire n'est pas : une promesse. Être listé ne veut pas dire être
 * intégré, et la pastille verte le dit sans détour.
 */
export function ChannelDirectory() {
  const [data, setData] = useState<Data | null>(null)
  const [recherche, setRecherche] = useState('')
  const [type, setType] = useState('')
  const [demande, setDemande] = useState<Canal | null>(null)

  useEffect(() => {
    api.listChannels().then(setData).catch(() => undefined)
  }, [])

  const visibles = useMemo(() => {
    if (!data) return []
    const terme = recherche.trim().toLowerCase()
    return data.canaux
      .filter((c) => !type || c.type === type)
      .filter((c) => !terme || c.label.toLowerCase().includes(terme))
      .sort((a, b) => Number(b.integre) - Number(a.integre) || a.label.localeCompare(b.label))
  }, [data, recherche, type])

  if (!data) return null

  const compte = (id: string) => data.canaux.filter((c) => c.type === id).length

  return (
    <>
      <h2 className="mt-12 font-bold">L'annuaire complet</h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
        {`${data.total} canaux connus : places de marché, comparateurs, plateformes d'affiliation, régies publicitaires et outils du commerce en ligne. `}
        <b>Être listé ici ne veut pas dire être relié.</b> Nous ne nous fermons à aucune plateforme :
        si celle qu'il vous faut n'est pas encore branchée, demandez-la et nous la coderons.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[14rem] flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher parmi les canaux"
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-sm outline-none focus:border-purple-400/60"
          />
        </label>

        <button
          type="button"
          onClick={() => setType('')}
          className={
            type === ''
              ? 'rounded-full bg-purple-500/25 px-3 py-1.5 text-xs font-semibold text-purple-200'
              : 'rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5'
          }
        >
          {`Tous (${data.total})`}
        </button>
        {data.types.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setType(type === t.id ? '' : t.id)}
            title={t.aide}
            className={
              type === t.id
                ? 'rounded-full bg-purple-500/25 px-3 py-1.5 text-xs font-semibold text-purple-200'
                : 'rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5'
            }
          >
            {`${t.label} (${compte(t.id)})`}
          </button>
        ))}
      </div>

      {type ? (
        <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-gray-500">
          {data.types.find((t) => t.id === type)?.aide}
        </p>
      ) : null}

      {visibles.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          Aucun canal ne correspond. Demandez-le quand même : écrivez-nous le nom, nous le
          regarderons.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {visibles.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setDemande(c)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2.5 text-left transition hover:bg-white/10"
              >
                <img
                  src={`/logos/${c.logo}`}
                  alt=""
                  loading="lazy"
                  className="h-9 w-9 shrink-0 rounded-lg bg-white/90 object-contain p-1"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold">{c.label}</span>
                  {c.integre ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                      <Check size={9} />
                      <span>reliée</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-500">pas encore reliée</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {demande ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setDemande(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1b1633] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={`/logos/${demande.logo}`}
                  alt=""
                  className="h-11 w-11 rounded-lg bg-white/90 object-contain p-1"
                />
                <div>
                  <h3 className="font-bold">{demande.label}</h3>
                  <p className="text-xs text-gray-500">
                    {data.types.find((t) => t.id === demande.type)?.label}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDemande(null)}
                className="p-1 text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {demande.integre ? (
              <p className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs leading-relaxed text-emerald-100">
                Cette destination est déjà reliée : vous la retrouvez dans la fenêtre « Diffuser »,
                et sa clé se règle dans API Connect.
              </p>
            ) : (
              <>
                <p className="mt-4 text-xs leading-relaxed text-gray-400">
                  {data.types.find((t) => t.id === demande.type)?.aide}
                </p>
                <p className="mt-3 rounded-xl border border-white/10 bg-black/25 p-3 text-xs leading-relaxed text-gray-300">
                  Ce canal n'est pas encore branché. Dites-nous que vous en avez besoin : c'est ce
                  qui décide de l'ordre dans lequel nous les codons. Nous ne refusons aucune
                  plateforme par principe.
                </p>

                <a
                  href={`mailto:contact@drop-shipper.fr?subject=${encodeURIComponent(
                    `Demande de canal : ${demande.label}`,
                  )}&body=${encodeURIComponent(
                    `Bonjour,\n\nJe souhaite diffuser mes annonces sur ${demande.label}.\n\nMon compte vendeur : (précisez si vous en avez déjà un)\nCe que je vends : \n\nMerci.`,
                  )}`}
                  className="btn-gradient mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold"
                >
                  <Send size={14} />
                  <span>{`Je veux ${demande.label}`}</span>
                </a>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
