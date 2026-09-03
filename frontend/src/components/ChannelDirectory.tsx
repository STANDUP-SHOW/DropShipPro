import { useEffect, useMemo, useState } from 'react'
import { Search, Check, Send, X, Rss, Copy } from 'lucide-react'
import { api } from '../lib/api'

type Data = Awaited<ReturnType<typeof api.listChannels>>
type Canal = Data['canaux'][number]

/**
 * Vos flux produit, et ce qu'ils suffisent à nourrir.
 *
 * **Le raisonnement, posé le 03/09/2026.** L'annuaire compte 314 marques, et le
 * vendeur en déduisait 314 chantiers. C'est faux pour quatre-vingt-une d'entre
 * elles : un comparateur ou une plateforme d'affiliation ne veut pas d'API, il
 * veut une adresse à relire chaque nuit. Nous servons déjà les deux formats
 * qu'ils attendent.
 *
 * Ces adresses vivaient dans un autre écran. Les mettre ici, juste au-dessus de
 * l'annuaire, c'est la différence entre « ce comparateur se nourrit d'un flux »
 * — une information qui n'avance à rien — et « voici l'adresse, copiez-la ».
 */
function FluxProduit({ data }: { data: Data }) {
  const [copie, setCopie] = useState<string | null>(null)

  if (!data.boutiques.length) {
    return (
      <>
        <h2 className="mt-12 font-bold">Vos flux produit</h2>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
          {`${data.aFlux} canaux de l'annuaire ne demandent aucun connecteur : ils lisent un flux produit. `}
          Créez d'abord une boutique dans Réglages — c'est elle qui porte l'adresse du flux.
        </p>
      </>
    )
  }

  return (
    <>
      <h2 className="mt-12 font-bold">Vos flux produit</h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500">
        {`${data.aFlux} canaux de l'annuaire ne demandent aucun connecteur : comparateurs, plateformes d'affiliation et boutiques sociales lisent un flux produit et se mettent à jour seuls. `}
        <b>Les deux adresses ci-dessous suffisent à les servir tous.</b> Elles sont publiques et en
        lecture seule : elles peuvent figurer dans n'importe quel espace marchand.
      </p>

      <div className="mt-4 space-y-4">
        {data.boutiques.map((b) => (
          <div key={b.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold">{b.name}</p>
            <div className="mt-3 space-y-3">
              {data.formats.map((f) => {
                const adresse = b.adresses[f.id]
                if (!adresse) return null
                const cle = `${b.id}-${f.id}`
                return (
                  <div key={f.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-xs font-semibold text-purple-200">{f.label}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(adresse)
                          setCopie(cle)
                          setTimeout(() => setCopie((c) => (c === cle ? null : c)), 1800)
                        }}
                        className="inline-flex items-center gap-1 text-[11px] text-purple-300 hover:text-purple-200"
                      >
                        {copie === cle ? <Check size={11} /> : <Copy size={11} />}
                        <span>{copie === cle ? 'Copiée' : "Copier l'adresse"}</span>
                      </button>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">{f.aide}</p>
                    {/*
                      L'adresse est longue et ne doit pas élargir la page : elle
                      défile dans sa propre boîte plutôt que de pousser la mise
                      en page — le défaut qu'on vient de corriger ailleurs.
                    */}
                    <p className="mt-1 overflow-x-auto whitespace-nowrap rounded-lg bg-black/30 px-2 py-1.5 font-mono text-[11px] text-gray-300">
                      {adresse}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

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
 * intégré, et les pastilles le disent sans détour — trois états, parce qu'il y
 * en a trois : reliée, servie par votre flux, ou pas encore branchée.
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
      /*
       * Ce qui est utilisable aujourd'hui remonte : les reliées d'abord, puis
       * celles que le flux du vendeur suffit à servir, puis le reste. Trier
       * seulement sur `integre` enterrait quatre-vingt-une destinations
       * exploitables le jour même au milieu de deux cent trente qui ne le sont
       * pas.
       */
      .sort(
        (a, b) =>
          Number(b.integre) - Number(a.integre) ||
          Number(Boolean(b.flux)) - Number(Boolean(a.flux)) ||
          a.label.localeCompare(b.label),
      )
  }, [data, recherche, type])

  if (!data) return null

  const compte = (id: string) => data.canaux.filter((c) => c.type === id).length

  return (
    <>
      <FluxProduit data={data} />

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
                  {/*
                    Trois états, et non deux.

                    « Pas encore reliée » était faux pour quatre-vingt-une
                    entrées : elles n'attendent aucun connecteur, elles
                    attendent que le vendeur colle l'adresse de son flux. Les
                    ranger avec celles qui demandent des mois de travail lui
                    cachait ce qu'il pouvait faire le jour même.
                  */}
                  {c.integre ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                      <Check size={9} />
                      <span>reliée</span>
                    </span>
                  ) : c.flux ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-sky-300">
                      <Rss size={9} />
                      <span>par votre flux</span>
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
            ) : demande.flux ? (
              /*
                Ce canal ne demande rien à coder : il demande une adresse.
                Le vendeur peut donc s'en servir aujourd'hui, sans nous attendre
                — et le lui dire ici évite qu'il demande un développement dont il
                n'a pas besoin.
              */
              <>
                <p className="mt-4 text-xs leading-relaxed text-gray-400">
                  {data.types.find((t) => t.id === demande.type)?.aide}
                </p>
                <p className="mt-3 rounded-xl border border-sky-400/30 bg-sky-400/10 p-3 text-xs leading-relaxed text-sky-100">
                  <b>Rien à coder de notre côté : ce canal lit un flux produit.</b> {demande.flux.ou}
                </p>
                {data.boutiques.length ? (
                  <div className="mt-3 space-y-2">
                    {data.boutiques.map((b) => {
                      const adresse = b.adresses[demande.flux!.format]
                      if (!adresse) return null
                      return (
                        <div key={b.id}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[11px] font-semibold text-gray-300">{b.name}</span>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard.writeText(adresse)}
                              className="inline-flex items-center gap-1 text-[11px] text-purple-300 hover:text-purple-200"
                            >
                              <Copy size={11} />
                              <span>Copier</span>
                            </button>
                          </div>
                          <p className="mt-0.5 overflow-x-auto whitespace-nowrap rounded-lg bg-black/30 px-2 py-1.5 font-mono text-[11px] text-gray-300">
                            {adresse}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-gray-500">
                    Créez une boutique dans Réglages : c'est elle qui porte l'adresse du flux.
                  </p>
                )}
              </>
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
