import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Sparkles, Truck, Share2, Store, Globe, User, MessagesSquare, Search, TrendingUp, Newspaper, ArrowUpRight } from 'lucide-react'
import { Layout } from '../components/Layout'
import { RecommendedProducts } from '../components/RecommendedProducts'
import { OpportunityList } from '../components/OpportunityList'
import { SignalList } from '../components/SignalList'
import { ReportList } from '../components/ReportList'
import { BoutonAutoMode } from '../components/BoutonAutoMode'
import { DepartmentChat } from '../components/DepartmentChat'
import { DemandesAnalyse } from '../components/DemandesAnalyse'
import { ProductInfo } from '../components/ProductInfo'
import { DepartmentSales } from '../components/DepartmentSales'
import { AnalysesRapports } from '../components/AnalysesRapports'
import { GagnantsRapports } from '../components/GagnantsRapports'
import { api } from '../lib/api'
import { PageCreative, Entete } from '../components/creative/Creative'
import { Provenance } from '../components/creative/Veille'

type Department = Awaited<ReturnType<typeof api.listDepartments>>[number]

const TABS = [
  { id: 'ADVICE' as const, label: 'Produits gagnants', icon: Sparkles },
  // Les analyses quotidiennes des agents, rangées dans le rayon qu'elles
  // concernent (19/09/2026) : la même table que la page Analyses de marché,
  // bornée aux catégories que ce rayon couvre.
  { id: 'ANALYSES' as const, label: 'Analyses de marché', icon: Newspaper },
  { id: 'INFO' as const, label: 'Info sur un produit', icon: Search },
  { id: 'SUPPLIERS' as const, label: 'Fournisseurs', icon: Truck },
  { id: 'SOCIAL' as const, label: 'Réseaux sociaux', icon: Share2 },
  { id: 'MARKET' as const, label: 'Places de marché', icon: Store },
  { id: 'SALES' as const, label: 'Ses ventes', icon: TrendingUp },
]

/**
 * Mon rayon BOOST — le bureau d'un chef de rayon (maquette du 16/10/2026, vue 06).
 *
 * En tête, la question de Max : « Quel rayon souhaitez-vous booster ? », avec
 * le menu déroulant des rayons confiés ; le bloc du rayon choisi s'ouvre
 * dessous : sa couverture, sa mission et ses tarifs (lus dans la grille du
 * serveur, jamais écrits ici), puis la conversation avec le chef, ouverte dans
 * le bloc même, et ses outils — gagnants, analyses, fournisseurs, réseaux,
 * places de marché, ventes — un clic plus bas.
 */
export default function Rayon() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [rayons, setRayons] = useState<Department[]>([])
  const [department, setDepartment] = useState<Department | null>(null)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('ADVICE')
  const [scope, setScope] = useState<'ALL' | 'PERSONAL'>('ALL')
  const [view, setView] = useState<'LIVE' | 'REPORTS'>('LIVE')
  const [missing, setMissing] = useState(false)
  /** L'état de l'enquête lancée à la main : 'en-cours', ou le résultat dit. */
  const [enquete, setEnquete] = useState<string | null>(null)
  /** La grille des tarifs du serveur : ce que coûtent une analyse et une question. */
  const [tarifs, setTarifs] = useState<Record<string, number>>({})
  const parler = useRef<HTMLElement>(null)
  const outils = useRef<HTMLElement>(null)

  function chargerRayon() {
    api
      .listDepartments()
      .then((list) => {
        const tous = Array.isArray(list) ? list : []
        setRayons(tous)
        const found = tous.find((d) => d.id === id)
        if (found) {
          setDepartment(found)
          setMissing(false)
        } else setMissing(true)
      })
      .catch(() => setMissing(true))
  }

  useEffect(() => {
    chargerRayon()
    setEnquete(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    api
      .listPlans()
      .then((p) => setTarifs(p?.tarifs ?? {}))
      .catch(() => undefined)
  }, [])

  function ouvrir(t: (typeof TABS)[number]['id']) {
    setTab(t)
    outils.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const choix =
    rayons.length > 0 ? (
      <section className="v-choix-rayon mt-8">
        <h2>
          Quel rayon souhaitez-vous <em>booster ?</em>
        </h2>
        <label className="block">
          <span className="sr-only">Choisir le rayon</span>
          <select className="c-champ" value={department ? id : ''} onChange={(e) => navigate(`/rayon/${e.target.value}`)}>
            {department ? null : <option value="">Choisir un rayon…</option>}
            {rayons.map((d) => (
              <option key={d.id} value={d.id}>
                {`${d.emoji} ${d.label} — ${d.agentName}${d.autoMode ? ' · BOOST' : ''}`}
              </option>
            ))}
          </select>
        </label>
      </section>
    ) : null

  if (missing) {
    return (
      <Layout>
        <PageCreative>
          {choix}
          <p className="mt-8 text-sm text-[var(--c-texte-2)]">Ce rayon n'existe pas ou n'est plus confié.</p>
          <Link to="/rayons" className="v-lien mt-3">
            Retour aux chefs de rayon <ArrowUpRight size={12} />
          </Link>
        </PageCreative>
      </Layout>
    )
  }

  if (!department) {
    return (
      <Layout>
        <PageCreative>
          <p className="mt-8 text-sm text-[var(--c-texte-2)]">Chargement…</p>
        </PageCreative>
      </Layout>
    )
  }

  const nom = department.agentName
  const rayonMin = department.label.toLowerCase()

  return (
    <Layout>
      <PageCreative>
        {choix}

        <Entete
          surtitre="06 / Mon rayon BOOST"
          ligne1={`${department.label}.`}
          ligne2={`Le terrain de ${nom}.`}
          chapo={department.focus}
        />

        <div className="v-deux mt-8">
          {/* ---------- La couverture ---------- */}
          <div className="v-couverture">
            <div className="v-puce" aria-hidden>
              <b>{nom}</b>
              <span>Intelligence / {department.label}</span>
            </div>
            <p className="c-etiquette relative">Chef de rayon en poste</p>
            <h3 className="mt-3">
              Les bonnes questions.
              <br />
              Les prochaines pistes.
            </h3>
            <button
              type="button"
              className="c-bouton relative mt-5 w-fit"
              onClick={() => {
                parler.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                window.setTimeout(() => parler.current?.querySelector<HTMLElement>('textarea, input[type="text"]')?.focus(), 400)
              }}
            >
              <span>Préparer une question</span>
              <ArrowUpRight size={15} />
            </button>
          </div>

          {/* ---------- La mission, les tarifs, les interrupteurs ---------- */}
          <div className="v-carte flex flex-col gap-4">
            <p className="c-etiquette">Sa mission</p>
            <p className="text-3xl font-semibold leading-tight">
              Détecter.
              <br />
              Comparer.
              <br />
              Vous éclairer.
            </p>
            <p className="text-sm leading-relaxed text-[var(--c-texte-2)]">
              {department.covers?.length
                ? `${nom} surveille pour vous : ${department.covers.join(', ')}.`
                : `${nom} surveille le rayon ${rayonMin} pour vous.`}
            </p>
            {tarifs.analyse || tarifs.questionChef ? (
              <div className="grid grid-cols-2 gap-3 border-t border-[var(--c-trait)] pt-4">
                {tarifs.analyse ? (
                  <p className="v-chiffre">
                    {`${tarifs.analyse} drops`}
                    <small>par produit / analyse de marché</small>
                  </p>
                ) : null}
                {tarifs.questionChef ? (
                  <p className="v-chiffre">
                    {`≈ ${tarifs.questionChef} drops`}
                    <small>par question, selon la demande</small>
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-[var(--c-trait)] pt-4">
              {/* L'interrupteur AUTO-MODE : analyse de marché + gagnants toutes les douze heures. */}
              <BoutonAutoMode
                actif={department.autoMode}
                onBascule={async (enabled) => {
                  const r = await api.setRayonAuto(department.id, enabled)
                  setDepartment((d) => (d ? { ...d, autoMode: r.autoMode } : d))
                }}
              />
              <button
                type="button"
                disabled={enquete === 'en-cours'}
                onClick={() => {
                  setEnquete('en-cours')
                  api
                    .lancerEnquete(department.id)
                    .then((r) =>
                      setEnquete(
                        r.raison ??
                          (r.deposees
                            ? `${r.deposees} produit(s) gagnant(s) déposé(s) : regardez l'onglet Produits gagnants.`
                            : `Rien de neuf : les ${r.relevees} produits du flux étaient déjà repérés.`),
                      ),
                    )
                    .catch((err) => setEnquete(err instanceof Error ? err.message : "L'enquête a échoué."))
                }}
                className="c-bouton-sec !text-xs"
              >
                {enquete === 'en-cours' ? 'Enquête en cours…' : "Lancer l'enquête du jour"}
              </button>
              {enquete && enquete !== 'en-cours' ? <p className="w-full text-xs leading-snug text-[var(--c-lime)]">{enquete}</p> : null}
              <p className="w-full text-xs text-[var(--c-texte-2)]">
                {`${nom} est en poste. Ses questions et ses analyses se paient en drops, au moment où elles ont lieu : voir `}
                <Link to="/credits" className="v-lien">
                  Mes crédits
                </Link>
                .
              </p>
            </div>
          </div>
        </div>

        {/* ---------- Les raccourcis ---------- */}
        <nav className="v-raccourcis mt-6" aria-label={`Les outils de ${nom}`}>
          {(
            [
              ['01', 'Produits gagnants', 'ADVICE'],
              ['02', 'Analyses de marché', 'ANALYSES'],
              ['03', 'Réseaux sociaux', 'SOCIAL'],
              ['04', 'Places de marché', 'MARKET'],
            ] as const
          ).map(([n, label, t]) => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => ouvrir(t)}>
              <b>{n}</b>
              <span>{label}</span>
              <ArrowUpRight size={14} />
            </button>
          ))}
        </nav>

        {/* ---------- Parler au chef, dans le bloc du rayon ---------- */}
        <section ref={parler} className="mt-12 scroll-mt-24">
          <div className="v-titre-section">
            <div>
              <h2 className="c-h2">{`Parler à ${nom}`}</h2>
              <p>{`Une question sur le rayon ${rayonMin}, ou une analyse de vos produits : le coût s'affiche avant l'envoi.`}</p>
            </div>
            <MessagesSquare size={18} className="text-[var(--c-violet)]" />
          </div>
          <div className="v-outil mt-4">
            <DemandesAnalyse departmentId={department.id} departmentKey={department.key} agentName={nom} />
            <DepartmentChat departmentId={department.id} agentName={nom} emoji={department.emoji} role={department.label} />
          </div>
        </section>

        {/* ---------- Les outils du rayon ---------- */}
        <section ref={outils} className="mt-12 scroll-mt-24">
          <div className="v-titre-section">
            <div>
              <h2 className="c-h2">À quoi s'intéresse-t-on ?</h2>
              <p>{`Ce que ${nom} a trouvé, ce qu'il a analysé, et d'où ça vient.`}</p>
            </div>
          </div>
          <div className="c-filtres mt-4" role="group">
            {TABS.map((t) => {
              const Icon = t.icon
              return (
                <button key={t.id} type="button" className="c-filtre inline-flex items-center gap-1.5" aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
                  <Icon size={13} />
                  <span>{t.label}</span>
                </button>
              )
            })}
          </div>

          {/* Le filtre global/personnel n'a de sens que sur les trois sources de veille. */}
          {(['SUPPLIERS', 'SOCIAL', 'MARKET'] as string[]).includes(tab) && (
            <div className="c-filtres mt-3" role="group">
              <button type="button" className="c-filtre" aria-pressed={view === 'LIVE'} onClick={() => setView('LIVE')}>
                Trouvailles
              </button>
              <button type="button" className="c-filtre" aria-pressed={view === 'REPORTS'} onClick={() => setView('REPORTS')}>
                Rapports du jour
              </button>
              <button type="button" className="c-filtre inline-flex items-center gap-1.5" aria-pressed={scope === 'ALL'} onClick={() => setScope('ALL')}>
                <Globe size={12} /> Veille globale
              </button>
              <button type="button" className="c-filtre inline-flex items-center gap-1.5" aria-pressed={scope === 'PERSONAL'} onClick={() => setScope('PERSONAL')}>
                <User size={12} /> Ma veille
              </button>
            </div>
          )}

          <div className="v-outil mt-4">
            {tab === 'ADVICE' && (
              <>
                <section className="mt-5">
                  <h3 className="flex items-center gap-2 font-bold">
                    <Newspaper size={16} className="text-[var(--c-lime)]" />
                    <span>Les gagnants du jour</span>
                  </h3>
                  <p className="mt-1 text-xs text-[var(--c-texte-2)]">
                    {`Les produits relevés ce matin par les agents pour le rayon ${rayonMin}. Cochez pour importer en lot, ou confiez une fiche à l'extension.`}
                  </p>
                  <GagnantsRapports rayon={department.key} />
                </section>
                <section className="mt-8">
                  <h3 className="flex items-center gap-2 font-bold">
                    <Sparkles size={16} className="text-[var(--c-violet)]" />
                    <span>{`Ce que ${nom} conseille`}</span>
                  </h3>
                  <RecommendedProducts department={department.id} />
                </section>
              </>
            )}
            {tab === 'ANALYSES' && (
              <>
                <section className="mt-5">
                  <p className="text-xs text-[var(--c-texte-2)]">
                    {`Les analyses écrites chaque jour pour le rayon ${rayonMin}, la plus récente en tête. Cliquez une ligne pour la lire.`}
                  </p>
                  <AnalysesRapports type="rayon" rayon={department.key} />
                </section>
                <section className="mt-8">
                  <h3 className="flex items-center gap-2 font-bold">
                    <TrendingUp size={16} className="text-[var(--c-violet)]" />
                    <span>Mes analyses</span>
                  </h3>
                  <p className="mt-1 text-xs text-[var(--c-texte-2)]">
                    {`Les analyses de marché rédigées par ${nom} : en IA AUTO-MODE, une par demi-journée.`}
                  </p>
                  <ReportList section="MARKET" department={department.id} />
                </section>
              </>
            )}
            {tab === 'SALES' && <DepartmentSales departmentId={department.id} agentName={nom} />}
            {tab === 'INFO' && <ProductInfo departmentId={department.id} agentName={nom} />}
            {tab === 'SUPPLIERS' &&
              (view === 'REPORTS' ? (
                <ReportList section="SUPPLIERS" department={department.id} />
              ) : (
                <OpportunityList scope={scope} department={department.id} />
              ))}
            {tab === 'SOCIAL' &&
              (view === 'REPORTS' ? (
                <ReportList section="SOCIAL" department={department.id} />
              ) : (
                <SignalList kind="SOCIAL" scope={scope} department={department.id} />
              ))}
            {tab === 'MARKET' &&
              (view === 'REPORTS' ? (
                <ReportList section="MARKET" department={department.id} />
              ) : (
                <SignalList kind="MARKET" scope={scope} department={department.id} />
              ))}
          </div>
        </section>

        <Provenance texte={`Rayon ${rayonMin} · données de votre compte`} libelle="Voir tous les chefs de rayon" to="/rayons" />
      </PageCreative>
    </Layout>
  )
}
