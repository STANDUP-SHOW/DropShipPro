import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Eye, FlaskConical, RefreshCw } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocStats, type BlocData } from '../components/stats/TuileStat'
import {
  Anneau,
  Barres,
  Beignet,
  Case,
  CaseAutoShipper,
  CaseChiffre,
  Etapes,
  GrandGraphique,
  LigneATraiter,
  Progression,
  Trio,
  Valeur,
  ecrire,
  lecteur,
  nombre,
} from '../components/stats/VueEnsemble'
import { CarteMonde, type CarteData } from '../components/stats/CarteMonde'
import { blocsDemo, carteDemo } from '../lib/statsDemo'
import { demoActif, demoAutorise, demoChoisi, poserDemo } from '../lib/demo'
import { useAuth } from '../lib/auth'
import { api } from '../lib/api'

/**
 * L'accueil statistiques — la « Vue d'ensemble » du menu.
 *
 * **Refonte du 13/10/2026** (maquette de Max) : en tête, une vue compilée en
 * cases de tailles différentes (VueEnsemble.tsx) ; les blocs détaillés
 * d'avant restent dessous, repliés sous « Toutes les statistiques ».
 *
 * Ce qui suit décrit ces blocs détaillés : les quatorze blocs, en mosaïque.
 *
 * **L'empilage suit la photo fournie**, pas une colonne uniforme : la vue
 * générale s'étale seule sur toute la largeur, acquisition et fournisseurs se
 * partagent une rangée, ventes, livraisons et messagerie en tiennent une à
 * trois, et la plateforme ferme la page. C'est ce dessin-là qui donne au
 * tableau son air de poste de pilotage.
 *
 * **Le mode démonstration** est un outil réservé au seul compte de
 * démonstration : il ne s'active JAMAIS tout seul (règle du 11/09/2026). Un
 * compte neuf — y compris une première connexion Google — voit ses vraies
 * données, vides comprises. Seul ce compte-là voit la pilule DÉMO, et il faut
 * son clic pour remplir le site de chiffres d'exemple, étiquetés par un
 * bandeau ; rien n'est écrit en base, un second clic rend les vraies données.
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
  /*
   * Le mode démo n'appartient qu'au compte de démonstration : pour tout autre
   * vendeur la pilule n'existe pas, et plus aucun automatisme de « compte
   * vide » n'affiche de chiffres semés — chacun voit ses propres données.
   */
  const { user } = useAuth()
  const autorise = demoAutorise(user?.email)
  /**
   * `null` tant qu'on n'a pas vu les données : c'est elles qui décident —
   * sauf si le mode démo GLOBAL est déjà levé : cette pilule est le seul
   * interrupteur du site (06/09/2026), elle reprend son état au retour.
   */
  const [demo, setDemo] = useState<boolean | null>(autorise && demoActif() ? true : null)

  async function charger(jours: number) {
    setChargement(true)
    setErreur(null)
    try {
      const au = new Date()
      const du = new Date(au.getTime() - jours * 86400000)
      const r = await api.tableauStats(du, au)
      setBlocs(r.blocs)
      setCarte(r.carte)
      // AUCUNE auto-activation. Un compte neuf — y compris une première
      // connexion Google — voit SES données, vides comprises, jamais la démo.
      // La démo ne s'allume que si le compte de démonstration a cliqué la
      // pilule lui-même ; on ne fait que reprendre cet état global au retour.
      setDemo((actuel) => {
        if (actuel !== null) return actuel
        return autorise && demoChoisi() ? demoActif() : false
      })
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
  /*
   * Les commandes du grand graphique : une pastille par période, celle en
   * cours allumée au dégradé de la marque. Le bouton DÉMO (compte de
   * démonstration seulement) et le recalcul suivent.
   */
  const controles = (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {PERIODES.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setPeriode(p.id)}
          title={p.label}
          aria-pressed={periode === p.id}
          className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
            periode === p.id ? 'btn-gradient' : 'border border-[var(--trait)] text-[var(--texte-2)] hover:border-[var(--trait-fort)] hover:text-[var(--texte)]'
          }`}
        >
          <span className="hidden md:inline">{p.label}</span>
          <span className="md:hidden">{p.id === '365' ? '1 an' : `${p.id} j`}</span>
        </button>
      ))}

      {blocs && autorise ? (
        <button
          type="button"
          onClick={() =>
            setDemo((d) => {
              // La pilule commande tout le site : messages, commandes,
              // livraisons, rapports… suivent, jusqu'au retour ici.
              poserDemo(!d)
              return !d
            })
          }
          title={
            demo
              ? 'Mode démo activé sur tout le site — cliquez pour retrouver vos vraies données partout.'
              : 'Voir toute l\'application remplie de données de démonstration.'
          }
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
        aria-label="Recalculer"
        className="rounded-full border border-[var(--trait)] p-1.5 text-[var(--texte-2)] hover:bg-white/5"
      >
        <RefreshCw size={12} className={chargement ? 'animate-spin' : ''} />
      </button>
    </div>
  )

  const lire = affiches ? lecteur(affiches) : null
  const periodeLibelle = PERIODES.find((p) => p.id === periode)?.label.toLowerCase() ?? ''

  return (
    <Layout large>

      {erreur ? (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{erreur}</p>
      ) : null}

      {!affiches && !erreur ? <p className="mt-6 text-sm text-gray-500">Calcul en cours…</p> : null}

      {affiches && lire ? (
        <div className={`mt-4 space-y-3 transition ${chargement ? 'opacity-60' : ''}`}>
          {/*
            La vue compilée (maquette du 13/10/2026) : douze colonnes sur écran
            large, six sur tablette, une sur téléphone. Les cases n'ont pas
            toutes la même taille : le grand graphique d'abord, ce qui attend
            une action à côté, puis les petits graphiques dessous.
          */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6 xl:grid-cols-12">
            <CaseChiffre t={lire('vue-generale', 'ca')} teinte="#f28a4b" lien="/comptabilite" />
            <CaseChiffre t={lire('vue-generale', 'commandes')} teinte="#e85290" lien="/orders" />
            <CaseChiffre t={lire('vue-generale', 'marge')} teinte="#a78bfa" lien="/comptabilite" />
            <CaseChiffre t={lire('vue-generale', 'panier')} teinte="#fdbf06" lien="/orders" />

            <Case titre="Évolution de vos ventes" taille={8} enTete={controles} className="min-h-[340px]">
              <GrandGraphique a={lire('vue-generale', 'ca')} b={lire('vue-generale', 'commandes')} />
            </Case>

            <Case titre="À traiter aujourd’hui" taille={4} lien="/orders" libelleLien="Voir toutes les commandes">
              <LigneATraiter t={lire('ventes', 'nouvelles')} label="Nouvelles commandes" aide="À confirmer" vers="/orders" teinte="#f28a4b" />
              <LigneATraiter t={lire('livraisons', 'a-expedier')} label="À expédier" aide="Commande fournisseur à passer" vers="/livraisons" teinte="#e85290" />
              <LigneATraiter t={lire('messagerie', 'attente')} label="Messages en attente" aide="Une réponse attendue" vers="/messages" teinte="#a78bfa" />
              <LigneATraiter t={lire('sav-clients', 'ouverts')} label="Tickets SAV ouverts" aide="Demandes de vos clients" vers="/sav" teinte="#fdbf06" />
              <LigneATraiter t={lire('fournisseurs', 'retards')} label="Retards fournisseurs" aide="Plus de 10 jours" vers="/commandes-fournisseurs" teinte="#34d399" />
            </Case>

            <Case titre="Votre catalogue avance" taille={4} lien="/dashboard" libelleLien="Ouvrir mes annonces">
              <div className="space-y-3">
                <Progression label="Publiés" fait={nombre(lire('acquisition', 'publies'))} total={nombre(lire('catalogue', 'actifs'))} teinte="#f28a4b" />
                <Progression label="Publiables" fait={nombre(lire('acquisition', 'publiables'))} total={nombre(lire('catalogue', 'actifs'))} teinte="#e85290" />
                <Progression label="Analysés" fait={nombre(lire('acquisition', 'potentiel'))} total={nombre(lire('catalogue', 'actifs'))} teinte="#a78bfa" />
              </div>
              <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-[var(--texte-2)]">Vos sources</p>
              <Beignet parts={lire('acquisition', 'sources')?.parts} vide="Aucun produit importé pour l’instant." />
            </Case>

            <Case titre="Vos canaux de vente" taille={4} lien="/plateformes-vente" libelleLien="Gérer mes canaux">
              <div className="mb-4 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--texte-2)]">Marketplaces actives</p>
                  <Valeur t={lire('marketplaces', 'actives')} />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--texte-2)]">Annonces diffusées</p>
                  <Valeur t={lire('marketplaces', 'annonces')} />
                </div>
              </div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--texte-2)]">Chiffre d’affaires par canal</p>
              <Barres parts={lire('marketplaces', 'ca')?.parts} unite=" €" vide="Aucune vente sur un canal pendant la période." />
            </Case>

            <Case titre="Livraisons" taille={4} lien="/livraisons" libelleLien="Suivre les colis">
              <div className="mb-4 flex items-center gap-4">
                <Anneau pour={nombre(lire('livraisons', 'taux'))} teinte="#34d399" centre={ecrire(lire('livraisons', 'taux'))} />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--texte-2)]">Délai moyen</p>
                  <Valeur t={lire('livraisons', 'delai')} petite />
                  <p className="mt-1 text-[11px] text-[var(--texte-3)]">Retards (10 j+) : {ecrire(lire('livraisons', 'retards'))}</p>
                </div>
              </div>
              <Etapes
                etapes={[
                  { label: 'À expédier', t: lire('livraisons', 'a-expedier') },
                  { label: 'Chez le fournisseur', t: lire('livraisons', 'preparation') },
                  { label: 'En transit', t: lire('livraisons', 'transit') },
                  { label: 'Livrées', t: lire('livraisons', 'livrees') },
                ]}
              />
            </Case>

            <Case titre="Messagerie" taille={3} lien="/messages" libelleLien="Répondre">
              <div className="flex items-center gap-3">
                <Anneau pour={nombre(lire('messagerie', 'taux'))} teinte="#a78bfa" centre={ecrire(lire('messagerie', 'taux'))} taille={64} />
                <div className="min-w-0 text-[11px] text-[var(--texte-2)]">
                  <p>Taux de réponse</p>
                  <p className="mt-1">
                    Réponse en <b className="text-[var(--texte)]">{ecrire(lire('messagerie', 'temps'))}</b>
                  </p>
                  <p className="mt-1">
                    Conversations <b className="text-[var(--texte)]">{ecrire(lire('messagerie', 'conversations'))}</b>
                  </p>
                </div>
              </div>
            </Case>

            <Case titre="SAV clients" taille={3} lien="/sav" libelleLien="Ouvrir le SAV">
              <Trio
                items={[
                  { label: 'Ouverts', t: lire('sav-clients', 'ouverts') },
                  { label: 'En cours', t: lire('sav-clients', 'en-cours') },
                  { label: 'Résolus', t: lire('sav-clients', 'resolus') },
                ]}
              />
            </Case>

            <Case titre="Vos finances" taille={3} lien="/comptabilite" libelleLien="Comptabilité">
              <Barres
                parts={[
                  { label: 'CA net', valeur: nombre(lire('finances', 'ca-net')) ?? 0 },
                  { label: 'Coûts produits', valeur: nombre(lire('finances', 'couts')) ?? 0 },
                  { label: 'Marge brute', valeur: Math.max(0, nombre(lire('finances', 'marge-brute')) ?? 0) },
                ]}
                unite=" €"
                vide="Aucune vente sur la période."
              />
            </Case>

            <Case titre="Vos rayons" taille={3} lien="/categories" libelleLien="Catégories">
              <Beignet parts={lire('rayons', 'repartition')?.parts} vide="Aucun produit rangé dans un rayon." />
            </Case>

            <CaseAutoShipper />

            <Case titre="Votre compte" taille={4} lien="/credits" libelleLien="Mes crédits">
              <div className="flex items-center gap-4">
                <Anneau pour={nombre(lire('plateforme', 'potentiel'))} teinte="#e85290" centre={ecrire(lire('plateforme', 'potentiel'))} />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--texte-2)]">Solde de drops</p>
                  <Valeur t={lire('plateforme', 'drops')} />
                  <p className="text-[11px] text-[var(--texte-3)]">Potentiel de l’application utilisé</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[var(--texte-2)]">
                <p>
                  Annonces IA <b className="text-[var(--texte)]">{ecrire(lire('plateforme', 'annonces-ia'))}</b>
                </p>
                <p>
                  Images <b className="text-[var(--texte)]">{ecrire(lire('plateforme', 'images'))}</b>
                </p>
              </div>
            </Case>
          </div>

          {/* La carte animée : clients, fournisseurs et livraisons. */}
          {carte || demo ? <CarteMonde carte={demo ? carteDemo() : carte!} /> : null}

          {/*
            Le détail complet, replié : les douze blocs d'avant, dans l'ordre du
            menu. Rien n'est perdu, la vue d'ensemble n'en est que le résumé.
          */}
          <details className="group case-ds">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-bold text-[var(--texte)]">
              Toutes les statistiques
              <span className="text-xs font-medium text-[var(--texte-3)]">· {periodeLibelle}</span>
              <ChevronDown size={16} className="ml-auto text-[var(--texte-3)] transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-3 px-3 pb-3">
              {RANGEES.map((rangee) => {
                const presents = rangee.map((id) => parId.get(id)).filter((b): b is BlocData => Boolean(b))
                if (!presents.length) return null
                return (
                  <div
                    key={rangee.join('-')}
                    className={`grid grid-cols-1 gap-3 ${presents.length === 2 ? 'xl:grid-cols-2' : presents.length === 3 ? 'xl:grid-cols-3' : ''}`}
                  >
                    {presents.map((bloc) => (
                      <BlocStats key={bloc.id} bloc={bloc} />
                    ))}
                  </div>
                )
              })}
              {demo ? null : (
                <p className="pb-1 text-center text-[11px] text-[var(--texte-3)]">
                  Les tuiles en retrait attendent leur donnée — la raison est écrite dessus. Aucun chiffre n'est estimé.
                </p>
              )}
            </div>
          </details>
        </div>
      ) : null}

      {/* En bas, sous les stats — comme tous les encarts jaunes (05/09/2026). */}
      {demo ? (
        <p className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-xs leading-relaxed text-amber-100">
          <b>Aperçu de démonstration.</b> Ces chiffres ne sont pas les vôtres : ils laissent voir le
          graphisme du tableau tant que vos ventes n'ont pas commencé. Dès la première commande, vos
          vraies données prennent la place — et le bouton « DEMO » du graphique des ventes bascule quand
          vous voulez.
        </p>
      ) : null}
    </Layout>
  )
}
