import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Radar, Search, Sparkles, Store, FileText, ShieldCheck, X } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import {
  ACCENTS,
  AppelSuivant,
  BarreCompacte,
  Entete,
  Fenetre,
  PageCreative,
  photoSecteur,
} from '../components/creative/Creative'

type Catalogue = Awaited<ReturnType<typeof api.departmentCatalogue>>
type Profile = Catalogue['profiles'][number]
type Hired = Awaited<ReturnType<typeof api.listDepartments>>[number]

/** Ce que fait un chef de rayon : replié en bas de page, les profils passent d'abord. */
const MISSIONS = [
  {
    icon: Search,
    title: 'Il explore les plateformes fournisseurs',
    text: "Temu, AliExpress, DHgate, Banggood, JoyBuy. Il cherche les produits qui se vendent le plus, avec des critères précis : entrepôt européen, délai de livraison, garantie, prix d'achat, volume de ventes déjà réalisées, tendance à la hausse.",
  },
  {
    icon: Radar,
    title: 'Il explore les réseaux sociaux',
    text: "Campagnes publicitaires qui tournent, formats qui marchent, retours et commentaires, produits qui percent sur TikTok Shop. Il relève ce qui attire les acheteurs avant que le marché ne sature.",
  },
  {
    icon: Store,
    title: 'Il explore vos places de marché',
    text: "Ce qui s'y vend, à quel prix, avec quelle concurrence. C'est ce qui transforme un prix d'achat en marge réelle plutôt qu'en estimation.",
  },
  {
    icon: FileText,
    title: 'Il vous remet un rapport chaque jour',
    text: "Un rapport par source et par secteur, archivé. Vous relisez celui d'il y a trois semaines et vous comparez.",
  },
  {
    icon: Sparkles,
    title: 'Et une liste de produits gagnants, prêts à publier',
    text: "Chaque jour : prix d'achat, prix de vente conseillé, marge, concurrence constatée, et sur quelles places de marché le vendre. Il ne vous reste qu'à valider.",
  },
  {
    icon: ShieldCheck,
    title: 'Il propose, vous décidez',
    text: "Rien n'est importé ni publié sans votre geste — sauf si vous confiez cela au pilote automatique, qui a besoin d'au moins un chef de rayon pour travailler.",
  },
]

const initiales = (nom: string) =>
  nom
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase())
    .join('')

/** Ce que la fenêtre d'un profil montre : le chef, son rayon et, s'il est confié, ce qu'il a déposé. */
type Univers = { profil: Profile; poste: Hired | null; teinte: string }

/**
 * Chefs de rayon (vue 05 de l'audit du 15/10/2026) : une équipe de
 * spécialistes, un univers par secteur.
 *
 * Les profils passent avant l'explication, qui se replie en bas de page.
 * Chaque carte porte la photo de son rayon (les 24 photos de Rayons et
 * catégories), le prénom et le secteur ; sa fenêtre mène aux vrais livrables —
 * la fiche du rayon, ses analyses, ses prompts — et au brief du Studio.
 */
export default function Rayons() {
  const [catalogue, setCatalogue] = useState<Profile[] | null>(null)
  const [hired, setHired] = useState<Hired[]>([])
  const [confirming, setConfirming] = useState<Profile | null>(null)
  const [univers, setUnivers] = useState<Univers | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  function load() {
    api
      .departmentCatalogue()
      .then((c) => setCatalogue(Array.isArray(c?.profiles) ? c.profiles : []))
      .catch(() => {
        setCatalogue([])
        setError('Catalogue indisponible')
      })
    api
      .listDepartments()
      .then((l) => setHired(Array.isArray(l) ? l : []))
      .catch(() => undefined)
  }

  useEffect(load, [])

  async function hire(profile: Profile) {
    setBusy(true)
    setError(null)
    try {
      const created = await api.hireDepartment(profile.key)
      setConfirming(null)
      load()
      navigate(`/rayon/${created.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function release(d: Hired) {
    if (
      !window.confirm(
        `Rendre le rayon ${d.label} ? ${d.agentName} ne déposera plus rien, mais ses trouvailles restent dans votre veille.`,
      )
    )
      return
    await api.releaseDepartment(d.id).catch((e) => setError((e as Error).message))
    load()
  }

  const tous = catalogue ?? []
  const teinteDe = (key: string) => ACCENTS[Math.max(0, tous.findIndex((p) => p.key === key)) % ACCENTS.length]
  const profilDe = (d: Hired): Profile =>
    tous.find((p) => p.key === d.key) ?? {
      key: d.key,
      label: d.label,
      agentName: d.agentName,
      emoji: d.emoji,
      focus: d.focus,
      covers: d.covers,
      hired: true,
    }
  const libres = tous.filter((p) => !p.hired)
  const aArbitrer = hired.reduce((n, d) => n + (d.pending ?? 0), 0)

  return (
    <Layout>
      <PageCreative
        barre={
          <BarreCompacte>
            <span>
              <b>{hired.length}</b>
              {hired.length > 1 ? ' rayons confiés' : ' rayon confié'}
            </span>
            <span>
              <b>{aArbitrer}</b>
              {aArbitrer > 1 ? ' trouvailles à arbitrer' : ' trouvaille à arbitrer'}
            </span>
            <span>Confier un rayon est gratuit ; ses actions se paient en drops, annoncées avant chaque geste.</span>
          </BarreCompacte>
        }
      >
        <Entete
          surtitre="05 / Votre équipe"
          ligne1="Le secteur en tête."
          ligne2="Les idées en mouvement."
          chapo="Les chefs de rayon relient la veille, les produits et les pistes créatives. Leur spécialité devient le point d'entrée."
        />

        <section
          className="mt-8 flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-[14px] p-7"
          style={{ background: 'linear-gradient(120deg, #2a1f4d, #191e2e 70%)' }}
        >
          <div className="max-w-xl">
            <p className="c-etiquette !text-[var(--c-lime)]">Les spécialistes du studio</p>
            <p className="c-h2 mt-3">Votre prochain angle commence ici.</p>
            <p className="mt-2 text-sm text-[var(--c-texte-2)]">
              Un rayon, des observations et un brief clair. Vous choisissez la direction à développer.
            </p>
          </div>
          <span className="c-etoile text-[var(--c-violet)]" aria-hidden>
            ✳
          </span>
        </section>

        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

        {hired.length > 0 ? (
          <section className="mt-12">
            <p className="c-etiquette">{`${hired.length} en poste`}</p>
            <h2 className="c-h2 mt-2">Votre équipe.</h2>
            <ul className="c-equipe mt-5">
              {hired.map((d) => (
                <li key={d.id}>
                  <CarteProfil
                    profil={profilDe(d)}
                    teinte={teinteDe(d.key)}
                    poste={d}
                    onUnivers={() => setUnivers({ profil: profilDe(d), poste: d, teinte: teinteDe(d.key) })}
                    coin={
                      <button
                        type="button"
                        onClick={() => release(d)}
                        title="Rendre ce rayon"
                        aria-label={`Rendre le rayon ${d.label}`}
                        className="c-fleche !h-7 !w-7 bg-black/50"
                      >
                        <X size={13} />
                      </button>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mt-12">
          <p className="c-etiquette">
            {catalogue === null ? 'Chargement…' : `${libres.length} spécialistes disponibles`}
          </p>
          <h2 className="c-h2 mt-2">Une expertise. Un univers.</h2>
          <p className="mt-2 text-sm text-[var(--c-texte-2)]">
            Un agent par secteur. Chacun connaît ses fournisseurs, ses saisons et ses pièges.
          </p>
          {catalogue !== null && libres.length === 0 ? (
            <p className="c-panneau mt-5 p-6 text-sm text-[var(--c-texte-2)]">Tous les rayons sont confiés.</p>
          ) : null}
          <ul className="c-equipe mt-5">
            {libres.map((p) => (
              <li key={p.key}>
                <CarteProfil
                  profil={p}
                  teinte={teinteDe(p.key)}
                  poste={null}
                  onUnivers={() => setUnivers({ profil: p, poste: null, teinte: teinteDe(p.key) })}
                  onConfier={() => setConfirming(p)}
                />
              </li>
            ))}
          </ul>
        </section>

        <details className="c-panneau group mt-12 p-6">
          <summary className="cursor-pointer list-none font-bold">
            <span className="c-etiquette">En détail</span>
            <span className="mt-1 block text-lg">Ce que fait un chef de rayon</span>
          </summary>
          <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {MISSIONS.map((m) => {
              const Icon = m.icon
              return (
                <li key={m.title} className="flex gap-3">
                  <span className="mt-0.5 shrink-0 rounded-lg bg-white/10 p-2 text-[var(--c-lime)]">
                    <Icon size={16} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{m.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--c-texte-2)]">{m.text}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </details>

        <AppelSuivant question="Passez du secteur à votre première piste." libelle="Retour au studio" to="/marketing" />

        {univers ? (
          <FenetreUnivers
            univers={univers}
            onClose={() => setUnivers(null)}
            onConfier={() => {
              setConfirming(univers.profil)
              setUnivers(null)
            }}
          />
        ) : null}

        {confirming ? (
          <Fenetre
            titre={`Confier le rayon ${confirming.label} à ${confirming.agentName} ?`}
            onClose={() => setConfirming(null)}
          >
            <p className="mt-2 text-sm leading-relaxed text-[var(--c-texte-2)]">{confirming.focus}</p>
            <p className="mt-3 text-xs text-[var(--c-texte-2)]">
              {`Un onglet « ${confirming.label} » sera créé. ${confirming.agentName} y déposera ses trouvailles ; vous gardez la main sur tout ce qui est importé ou publié.`}
            </p>

            {/* Plus d'abonnement ni de salaire (07/09/2026) : confier un rayon
                est gratuit. Ce sont ses actions — une question, un conseil, un
                passage AUTO-MODE — qui se paient en drops, au moment où elles
                ont lieu. */}
            <div className="c-panneau mt-4 p-3">
              <p className="text-xs font-semibold text-[var(--c-lime)]">
                {`${confirming.agentName} se met au travail tout de suite — gratuit à confier.`}
              </p>
              <p className="mt-1 text-[11px] text-[var(--c-texte-2)]">
                Vous ne payez que ce que vous lui demandez : une question, un conseil produit ou un passage automatique
                coûtent chacun quelques drops, indiqués avant chaque geste. Voir{' '}
                <Link to="/credits" className="text-[var(--c-lime)] hover:underline">
                  la grille des tarifs
                </Link>
                .
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(null)} className="c-bouton-sec">
                Annuler
              </button>
              <button type="button" onClick={() => hire(confirming)} disabled={busy} className="c-bouton">
                {busy ? 'Création…' : 'Oui, intégrer'}
              </button>
            </div>
          </Fenetre>
        ) : null}
      </PageCreative>
    </Layout>
  )
}

function CarteProfil({
  profil,
  teinte,
  poste,
  onUnivers,
  onConfier,
  coin,
}: {
  profil: Profile
  teinte: string
  poste: Hired | null
  onUnivers: () => void
  onConfier?: () => void
  coin?: ReactNode
}) {
  const photo = photoSecteur({ rayon: profil.key })
  return (
    <article className="c-profil h-full">
      <div className="c-profil-photo">
        {photo ? <img src={photo} alt="" loading="lazy" /> : null}
        {coin ? <span className="absolute right-2 top-2 z-[2]">{coin}</span> : null}
      </div>
      <span className="c-initiales" style={{ background: teinte }} aria-hidden>
        {initiales(profil.agentName)}
      </span>
      <div className="flex flex-1 flex-col p-4 pt-12">
        <p className="text-lg font-extrabold">{profil.agentName}</p>
        <p className="c-etiquette mt-1" style={{ color: teinte }}>
          {profil.label}
        </p>
        <p className="mt-3 line-clamp-2 text-sm text-[var(--c-texte-2)]">{profil.focus}</p>

        {poste ? (
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              [poste.pending ?? 0, 'à arbitrer'],
              [poste.opportunities ?? 0, 'trouvailles'],
              [poste.signals ?? 0, 'signaux'],
            ].map(([v, l]) => (
              <div key={String(l)} className="rounded-lg bg-[var(--c-panneau-2)] py-2">
                <dt className="text-[10px] text-[var(--c-texte-2)]">{l}</dt>
                <dd className="text-base font-extrabold">{v}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="mt-4 flex flex-wrap gap-1">
            {profil.covers.slice(0, 3).map((c) => (
              <span key={c} className="rounded-full border border-[var(--c-trait)] px-2 py-0.5 text-[11px] text-[var(--c-texte-2)]">
                {c}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
          <button type="button" onClick={onUnivers} className="c-bouton-sec !py-1.5 !text-xs">
            Ouvrir son univers <ArrowUpRight size={13} />
          </button>
          {poste ? (
            <span className={`ml-auto text-xs font-bold ${poste.active ? 'text-[var(--c-lime)]' : 'text-[var(--c-rose)]'}`}>
              {poste.active ? 'En poste' : 'Inactif'}
            </span>
          ) : onConfier ? (
            <button type="button" onClick={onConfier} className="c-bouton ml-auto !py-1.5 !text-xs">
              Confier ce rayon
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

/** L'univers d'un chef : son secteur et l'accès à ses livrables réels. */
function FenetreUnivers({
  univers,
  onClose,
  onConfier,
}: {
  univers: Univers
  onClose: () => void
  onConfier: () => void
}) {
  const { profil, poste, teinte } = univers
  const photo = photoSecteur({ rayon: profil.key })
  const fiche = poste ? `/rayon/${poste.id}` : null
  const etapes = [
    {
      titre: 'Veille du secteur',
      texte: poste
        ? `${poste.signals ?? 0} signaux relevés et les analyses quotidiennes du rayon.`
        : 'Les analyses quotidiennes de ce secteur, lisibles dès maintenant.',
      to: fiche ?? '/analyse-marche',
      lien: poste ? 'Ouvrir le rayon' : 'Analyses de marché',
    },
    {
      titre: 'Produits à examiner',
      texte: poste
        ? `${poste.pending ?? 0} trouvailles à arbitrer, ${poste.opportunities ?? 0} au total.`
        : 'Les produits gagnants relevés par les agents, rayon par rayon.',
      to: fiche ?? '/produits-gagnants',
      lien: poste ? 'Voir ses trouvailles' : 'Produits gagnants',
    },
    {
      titre: 'Pistes de contenu',
      texte: 'Les analyses réseaux et les prompts publicitaires déposés pour ce secteur.',
      to: '/reseaux?vue=prompts',
      lien: 'Prompts IA',
    },
  ]

  return (
    <Fenetre titre={`${profil.agentName} — ${profil.label}`} onClose={onClose} large>
      {photo ? (
        <div className="relative mt-4 h-40 overflow-hidden rounded-xl">
          <img src={photo} alt="" className="h-full w-full object-cover" />
          <span className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${teinte}55, transparent 70%)` }} />
        </div>
      ) : null}
      <p className="mt-4 text-sm leading-relaxed text-[var(--c-texte-2)]">{profil.focus}</p>
      <ol className="mt-5 grid gap-3 md:grid-cols-3">
        {etapes.map((e, i) => (
          <li key={e.titre} className="c-panneau flex flex-col p-4">
            <span className="c-numero !text-lg" style={{ color: teinte }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <p className="mt-2 font-extrabold">{e.titre}</p>
            <p className="mt-1 flex-1 text-xs text-[var(--c-texte-2)]">{e.texte}</p>
            <Link to={e.to} className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[var(--c-lime)]">
              {e.lien} <ArrowUpRight size={13} />
            </Link>
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link to="/marketing?brief=1" className="c-bouton">
          <span>Préparer un brief pour ce secteur</span>
          <ArrowUpRight size={15} />
        </Link>
        {poste ? null : (
          <button type="button" className="c-bouton-sec" onClick={onConfier}>
            Confier ce rayon — gratuit
          </button>
        )}
      </div>
    </Fenetre>
  )
}
