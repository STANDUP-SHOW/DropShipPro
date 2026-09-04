import { useEffect, useMemo, useState } from 'react'
import { Eye, FlaskConical, RefreshCw } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocStats, type BlocData } from '../components/stats/TuileStat'
import { CarteMonde, type CarteData } from '../components/stats/CarteMonde'
import { blocsDemo, carteDemo, compteVide } from '../lib/statsDemo'
import { api } from '../lib/api'

/**
 * L'accueil statistiques : les quatorze blocs de la maquette, en mosaïque.
 *
 * **L'empilage suit la photo fournie**, pas une colonne uniforme : la vue
 * générale s'étale seule sur toute la largeur, acquisition et fournisseurs se
 * partagent une rangée, ventes, livraisons et messagerie en tiennent une à
 * trois, et la plateforme ferme la page. C'est ce dessin-là qui donne au
 * tableau son air de poste de pilotage.
 *
 * **Le mode démonstration**, demandé en toutes lettres : tant que le compte
 * n'a pas vendu, les tuiles montrent des chiffres de démonstration — semés,
 * donc identiques à chaque visite — pour que le graphisme se voie. Un bandeau
 * le dit sans détour et la bascule rend les vraies données en un clic : jamais
 * un chiffre de démonstration sans son étiquette.
 */

const PERIODES = [
  { id: '7', label: '7 jours', jours: 7 },
  { id: '30', label: '30 jours', jours: 30 },
  { id: '90', label: '90 jours', jours: 90 },
  { id: '365', label: '1 an', jours: 365 },
]

/**
 * L'empilage suit LE MENU, pas la numérotation de la maquette.
 *
 * Corrigé le 03/09/2026 : « l'accueil reprend celui de chaque partie du menu,
 * empilées ». La maquette donnait le style ; l'ordre, c'est la découpe --
 * Dashboard, Acquisition, Sourcing, Produits (annonces + catégories côte à
 * côte), Diffusion, Rayons IA, Ventes, Livraisons, SAV clients (avec sa
 * messagerie), SAV fournisseurs, Comptabilité, DropShipper. Marketing n'a pas
 * encore de bloc de statistiques : il entrera ici le jour où il en aura un.
 *
 * Une seule liste à modifier pour réordonner : chaque ligne est une rangée,
 * deux identifiants sur la même ligne se partagent la largeur.
 */
const RANGEES: string[][] = [
  ['vue-generale'], // Dashboard
  ['acquisition'], // Acquisition produits
  ['fournisseurs'], // Sourcing
  ['catalogue', 'rayons'], // Produits : mes annonces + catégories
  ['marketplaces'], // Diffusion
  ['marche'], // Mes rayons IA : analyses de marché (bloc 13)
  ['ventes'], // Ventes
  ['livraisons'], // Livraisons — la carte du monde suit
  ['sav-clients', 'messagerie'], // SAV clients + messagerie market places
  ['sav-fournisseurs'], // SAV fournisseurs
  ['finances'], // Comptabilité
  ['plateforme'], // DropShipper
]

export default function Statistiques() {
  const [blocs, setBlocs] = useState<BlocData[] | null>(null)
  const [carte, setCarte] = useState<CarteData | null>(null)
  const [periode, setPeriode] = useState('30')
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  /** `null` tant qu'on n'a pas vu les données : c'est elles qui décident. */
  const [demo, setDemo] = useState<boolean | null>(null)

  async function charger(jours: number) {
    setChargement(true)
    setErreur(null)
    try {
      const au = new Date()
      const du = new Date(au.getTime() - jours * 86400000)
      const r = await api.tableauStats(du, au)
      setBlocs(r.blocs)
      setCarte(r.carte)
      // Le premier chargement choisit le mode ; les suivants respectent le choix
      // du vendeur — une bascule qui se remet toute seule n'est pas une bascule.
      setDemo((actuel) => (actuel === null ? compteVide(r.blocs) : actuel))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Statistiques indisponibles')
    } finally {
      setChargement(false)
    }
  }

  useEffect(() => {
    charger(PERIODES.find((p) => p.id === periode)?.jours ?? 30)
  }, [periode])

  const affiches = useMemo(() => {
    if (!blocs) return null
    return demo ? blocsDemo(blocs) : blocs
  }, [blocs, demo])

  const parId = useMemo(() => new Map((affiches ?? []).map((b) => [b.id, b])), [affiches])

  /*
   * Les commandes vivent dans l'en-tête du bloc Vue générale, justifiées à
   * droite — demandé le 05/09/2026, sans titre de page. Des pastilles
   * colorées, une par période ; en vue étroite le libellé se raccourcit
   * (7 · 30 · 90 · 365). Le bouton DÉMO est à part, orange, écrit blanc.
   */
  const TEINTES: Record<string, string> = { '7': '#a78bfa', '30': '#22d3ee', '90': '#34d399', '365': '#fbbf24' }
  const controles = (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {PERIODES.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setPeriode(p.id)}
          title={p.label}
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold transition"
          style={
            periode === p.id
              ? { backgroundColor: `${TEINTES[p.id]}33`, color: TEINTES[p.id], boxShadow: `inset 0 0 0 1px ${TEINTES[p.id]}88` }
              : { color: '#9ca3af', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.10)' }
          }
        >
          <span className="hidden md:inline">{p.label}</span>
          <span className="md:hidden">{p.id}</span>
        </button>
      ))}

      {blocs ? (
        <button
          type="button"
          onClick={() => setDemo((d) => !d)}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white transition ${
            demo ? 'bg-orange-500' : 'bg-orange-500/60 hover:bg-orange-500/80'
          }`}
        >
          {demo ? <FlaskConical size={11} /> : <Eye size={11} />}
          <span>DEMO</span>
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => charger(PERIODES.find((p) => p.id === periode)?.jours ?? 30)}
        title="Recalculer"
        className="rounded-full border border-white/10 p-1.5 text-gray-400 hover:bg-white/5"
      >
        <RefreshCw size={12} className={chargement ? 'animate-spin' : ''} />
      </button>
    </div>
  )

  return (
    <Layout large>
      {demo ? (
        <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-xs leading-relaxed text-amber-100">
          <b>Aperçu de démonstration.</b> Ces chiffres ne sont pas les vôtres : ils laissent voir le
          graphisme du tableau tant que vos ventes n'ont pas commencé. Dès la première commande, vos
          vraies données prennent la place — et le bouton « DEMO » du bloc Vue générale bascule quand
          vous voulez.
        </p>
      ) : null}

      {erreur ? (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{erreur}</p>
      ) : null}

      {!affiches && !erreur ? <p className="mt-6 text-sm text-gray-500">Calcul en cours…</p> : null}

      {affiches ? (
        <div className={`mt-4 space-y-3 transition ${chargement ? 'opacity-60' : ''}`}>
          {RANGEES.map((rangee) => {
            const presents = rangee.map((id) => parId.get(id)).filter((b): b is BlocData => Boolean(b))
            if (!presents.length) return null
            return (
              <div key={rangee.join('-')} className="space-y-3">
                <div
                  className={`grid gap-3 ${presents.length === 2 ? 'xl:grid-cols-2' : presents.length === 3 ? 'xl:grid-cols-3' : ''}`}
                >
                  {presents.map((bloc) => (
                    <BlocStats key={bloc.id} bloc={bloc} enTete={bloc.id === 'vue-generale' ? controles : undefined} />
                  ))}
                </div>
                {/*
                  La carte animée, en position 2 — juste sous la Vue générale
                  (05/09/2026). Elle balaie clients, fournisseurs et livraisons
                  toute seule, toutes les deux secondes.
                */}
                {rangee[0] === 'vue-generale' && (carte || demo) ? (
                  <CarteMonde carte={demo ? carteDemo() : carte!} />
                ) : null}
              </div>
            )
          })}
          {demo ? null : (
            <p className="pb-2 text-center text-[11px] text-gray-600">
              Les tuiles en retrait attendent leur donnée — la raison est écrite dessus. Aucun chiffre n'est estimé.
            </p>
          )}
        </div>
      ) : null}
    </Layout>
  )
}
