import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Store, Rss, Plug, Puzzle, Ban, Plus } from 'lucide-react'
import { PlatformBadge } from './PlatformBadge'
import { api } from '../lib/api'
import { INTEGRATION_LABEL, type PlatformInfo } from '../lib/platforms'

type Shop = Awaited<ReturnType<typeof api.listShops>>[number]

/**
 * Le choix des destinations, rangé par mode de diffusion.
 *
 * Une grille unique mélangeait ce qui part tout seul, ce qui passe par un flux,
 * ce qui demande une clé et ce qui exige un clic du vendeur dans son navigateur.
 * Le vendeur cochait donc à l'aveugle et découvrait après coup qu'une de ses
 * cases n'avait rien publié.
 *
 * Cinq groupes, dans l'ordre où l'on décide : ses propres boutiques d'abord,
 * nommées une par une — c'est chez lui, c'est immédiat —, puis les flux, les
 * API, l'extension, et pour finir ce qui ne peut pas recevoir cette annonce,
 * avec la raison.
 */
export function PublishTargets({
  platforms,
  selected,
  onToggle,
  shopIds,
  onToggleShop,
}: {
  platforms: PlatformInfo[]
  selected: string[]
  onToggle: (id: string) => void
  shopIds: string[]
  onToggleShop: (id: string) => void
}) {
  const [shops, setShops] = useState<Shop[]>([])
  /** Les plateformes dont la cle est reellement enregistree. */
  const [reliees, setReliees] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.listShops().then(setShops).catch(() => undefined)
    /*
     * L etat reel des liaisons, pas seulement le mode de diffusion.
     *
     * La fenetre proposait Shopify de la meme facon qu aucun jeton ne soit
     * enregistre : le vendeur cochait, publiait, et decouvrait « en attente »
     * apres coup. Constate le 26/08/2026 -- quinze publications en attente pour
     * une liaison qui n avait jamais ete enregistree.
     */
    api
      .listCredentials()
      .then((c) => setReliees(new Set(c.filter((x: any) => x.connected).map((x: any) => x.platform))))
      .catch(() => undefined)
  }, [])

  // « Mon site » n'est plus une case : ce sont les boutiques du vendeur, une par
  // une et par leur nom. Cocher « Mon site » sans savoir lequel ne voulait rien
  // dire dès qu'il y en avait deux.
  const sansOwnSite = platforms.filter((p) => p.id !== 'OWN_SITE')

  const groupes = [
    {
      id: 'flux',
      titre: 'Boutiques à flux',
      icone: Rss,
      aide: "Nous publions un flux que la plateforme vient lire d'elle-même, à intervalle régulier.",
      liste: sansOwnSite.filter((p) => p.integration === 'feed'),
    },
    {
      id: 'api',
      titre: 'Boutiques à API',
      icone: Plug,
      aide: 'Publication directe dès que votre clé est enregistrée.',
      liste: sansOwnSite.filter((p) => p.integration === 'live' || p.integration === 'api-ready'),
    },
    {
      id: 'extension',
      titre: "Boutiques assistées par l'extension",
      icone: Puzzle,
      aide: "Aucune API publique : un onglet s'ouvre, l'extension remplit le formulaire, et c'est vous qui cliquez sur Publier.",
      liste: sansOwnSite.filter((p) => p.integration === 'extension'),
    },
  ]

  const impossibles = sansOwnSite.filter((p) => p.unavailable || p.integration === 'none')

  return (
    <div className="mt-4 space-y-5">
      {/* ---------- Mes boutiques, nommées ---------- */}
      <section>
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Store size={14} className="text-purple-300" />
          <span>Mes boutiques</span>
        </p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          Vos sites, servis par votre clé de catalogue. La publication est immédiate.
        </p>

        {shops.length === 0 ? (
          /*
           * Aucune boutique déclarée : une case « Mon site » quand même.
           *
           * Sans elle, un compte neuf n'avait plus aucun moyen de publier chez
           * lui — les boutiques nommées ont remplacé la case unique, et la
           * première boutique naît justement à la première publication. Cochée,
           * elle publie sans identifiant de boutique, et le serveur en crée une.
           */
          <button
            type="button"
            aria-pressed={selected.includes('OWN_SITE')}
            onClick={() => onToggle('OWN_SITE')}
            className={`mt-2 flex w-full items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition sm:w-1/2 ${
              selected.includes('OWN_SITE')
                ? 'border-purple-400 bg-purple-500/20 text-white'
                : 'border-dashed border-white/20 text-gray-300 hover:bg-white/5'
            }`}
          >
            <Store size={16} className="shrink-0 text-purple-300" />
            <span className="min-w-0 text-left leading-tight">
              <span className="block">Mon site</span>
              <span className="block text-[10px] font-normal opacity-70">
                Votre première boutique sera créée
              </span>
            </span>
            {selected.includes('OWN_SITE') ? <CheckCircle2 size={16} className="ml-auto shrink-0" /> : null}
          </button>
        ) : (
          <div className="@container mt-2 grid gap-2 @sm:grid-cols-2">
            {shops.map((s) => {
              const coche = shopIds.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={coche}
                  onClick={() => onToggleShop(s.id)}
                  className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition ${
                    coche
                      ? 'border-purple-400 bg-purple-500/20 text-white'
                      : 'border-white/10 text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <Store size={16} className="shrink-0 text-purple-300" />
                  <span className="min-w-0 text-left leading-tight">
                    <span className="block truncate">{s.name}</span>
                    <span className="block text-[10px] font-normal opacity-70">
                      {`${s.products} annonce(s)`}
                    </span>
                  </span>
                  {coche ? <CheckCircle2 size={16} className="ml-auto shrink-0" /> : null}
                </button>
              )
            })}
          </div>
        )}
        <p className="mt-2 text-[11px] text-gray-500">
          Vos boutiques se nomment et s'ajoutent dans{' '}
          <Link to="/settings" className="text-purple-300 underline">
            Réglages
          </Link>
          . Le nom que vous leur donnez est celui qui apparaît ici.
        </p>
      </section>

      {/* ---------- Flux, API, extension ---------- */}
      {groupes.map((g) =>
        g.liste.length ? (
          <section key={g.id}>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <g.icone size={14} className="text-purple-300" />
              <span>{g.titre}</span>
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">{g.aide}</p>

            {/*
              Deux colonnes selon la largeur du DIALOGUE, pas de l'écran.

              Signalé le 03/09/2026 sur un écran vertical : « quand on déplie une
              case marketplace reliée, ça affiche mal, ça conserve une case vide à
              côté ». `sm:` est un point de rupture de **fenêtre** : sur un écran
              vertical la fenêtre dépasse 640 px, donc deux colonnes s'installaient
              dans une boîte de 512 px — des cases de 245 px où le libellé passe à
              la ligne, des hauteurs qui divergent, et la voisine qui garde la
              sienne. D'où le trou.

              `@container` mesure la boîte elle-même. Et `h-full` sur la cellule
              avec `flex-1` sur le bouton fait que deux cases d'une même rangée ont
              toujours la même hauteur : même si l'une porte un avertissement de
              deux lignes, l'autre s'étire au lieu de laisser un vide.
            */}
            <div className="@container mt-2">
              <div className="grid gap-2 @sm:grid-cols-2">
              {g.liste.map((p) => {
                const coche = selected.includes(p.id)
                /*
                 * Une destination qui publie vraiment mais dont la clé manque.
                 *
                 * Elle reste cochable — le vendeur peut vouloir enregistrer son
                 * intention — mais elle le dit, et donne le chemin. La cocher
                 * sans savoir produisait une publication « en attente » que
                 * personne ne relisait.
                 */
                const manqueLaCle = p.integration === 'live' && !reliees.has(p.id)
                return (
                  <div key={p.id} className="flex h-full flex-col">
                    <button
                      type="button"
                      aria-pressed={coche}
                      onClick={() => onToggle(p.id)}
                      style={{ backgroundColor: coche ? p.color : 'transparent', borderColor: p.color }}
                      className={`flex w-full flex-1 items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition ${
                        coche ? 'text-white' : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <PlatformBadge id={p.id} label={p.label} color={p.color} size={24} domain={p.domain} />
                      <span className="min-w-0 text-left leading-tight">
                        <span className="block truncate">{p.label}</span>
                        <span className="block text-[10px] font-normal opacity-70">
                          {manqueLaCle ? 'Aucune clé enregistrée' : INTEGRATION_LABEL[p.integration]}
                        </span>
                      </span>
                      {coche ? <CheckCircle2 size={16} className="ml-auto shrink-0" /> : null}
                    </button>

                    {manqueLaCle ? (
                      <Link
                        to="/settings"
                        className="mt-1 block text-[11px] leading-snug text-amber-300 underline-offset-2 hover:underline"
                      >
                        {`${p.label} ne recevra rien tant que sa clé n'est pas enregistrée — la saisir dans Réglages`}
                      </Link>
                    ) : null}
                  </div>
                )
              })}
              </div>
            </div>
          </section>
        ) : null,
      )}

      {/* ---------- Ce qui ne peut pas recevoir cette annonce ---------- */}
      {impossibles.length ? (
        <section>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-400">
            <Ban size={14} />
            <span>Où vous ne pouvez pas diffuser</span>
          </p>
          <ul className="mt-2 space-y-1">
            {impossibles.map((p) => (
              <li key={p.id} className="flex items-baseline gap-2 text-[11px] text-gray-500">
                <span className="font-medium text-gray-400">{p.label}</span>
                <span>—</span>
                <span>{p.warning || p.note}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Link
        to="/plateformes-vente"
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 transition hover:bg-white/5"
      >
        <Plus size={12} />
        <span>Votre boutique n'est pas dans la liste ? Ajoutez-la</span>
      </Link>
    </div>
  )
}
