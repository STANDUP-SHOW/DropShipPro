import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles, ArrowRight, ArrowUp, Monitor, Smartphone, ExternalLink, RotateCcw, Plus, Pencil, Bell,
  CreditCard, CheckCircle2, AlertTriangle, Loader2, ChevronDown, Trash2, Copy, Image as ImageIcon, Puzzle,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { VitrineBlock } from '../components/VitrineBlock'
import { DropCoin } from '../components/DropCoin'
import { IconeDropShop, LogoDropShopEntete } from '../components/LogoDropShop'
import { api, type DirectionDropShop, type EtatDropShop, type ExtensionDropShop, type GammeDropShop, type TravailDropShop } from '../lib/api'

type Boutique = Awaited<ReturnType<typeof api.listShops>>[number]

/**
 * DropShop IA — le studio (17/09/2026).
 *
 * Refonte demandée par Max après de très mauvais retours sur la vitrine à
 * thèmes : « un Lovable-like ». Le 13/10/2026, la création devient une
 * conversation (voir `Studio`) ; 500 drops la création, une seule fois à vie,
 * modifications à volonté (TARIFS : backend/src/services/tarifs.ts).
 *
 * Une fois créée : à gauche la conversation (chaque version y est un échange),
 * à droite l'aperçu réel de la boutique — c'est la vraie page servie à
 * /b/<slug>, pas une maquette — en largeur ordinateur ou téléphone. Le travail
 * dure des minutes : la page relit l'état toutes les trois secondes tant qu'il
 * tourne, et survit à un rechargement puisque l'état vit côté serveur.
 */
export default function CreerBoutique() {
  const [boutiques, setBoutiques] = useState<Boutique[]>([])
  const [choisie, setChoisie] = useState<string | null>(null)
  const [nom, setNom] = useState('')
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(() => {
    api
      .listShops()
      .then(setBoutiques)
      .catch(() => setErreur("Vos boutiques n'ont pas pu être chargées."))
  }, [])

  useEffect(charger, [charger])

  const hebergees = boutiques.filter((b) => (b as { platform?: string | null }).platform === 'dropshipper')
  const active = hebergees.find((b) => b.id === choisie) ?? null

  /**
   * Supprimer une boutique pour en recréer une autre (demande de Max, 17/09).
   * Ses annonces ne sont pas supprimées : elles perdent leur boutique et
   * cessent d'être servies, comme dans Mes sites.
   */
  async function supprimerBoutique(b: Boutique) {
    const ok = window.confirm(`Supprimer la boutique « ${b.name} » ? Sa page, ses versions IA et son adresse /b/${b.slug ?? ''} disparaissent. Ses annonces restent dans votre catalogue.`)
    if (!ok) return
    setBusy(true)
    setErreur(null)
    try {
      await api.deleteShop(b.id)
      if (choisie === b.id) setChoisie(null)
      charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Suppression impossible')
    } finally {
      setBusy(false)
    }
  }

  async function creer() {
    if (!nom.trim()) return setErreur('Donnez un nom à votre boutique.')
    setBusy(true)
    setErreur(null)
    try {
      const creee = await api.createShop({ name: nom.trim(), platform: 'dropshipper' })
      setNom('')
      setChoisie(creee.id)
      charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Création impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      {/*
        La marque en tête, et pas deux lettres (demandé le 19/09/2026).
        Le logo vit dans public/logos : voir LogoDropShop.tsx pour les deux
        noms de fichiers et ce qui s'affiche tant qu'ils ne sont pas déposés.
      */}
      <h1 className="flex flex-wrap items-center gap-3 text-3xl font-black tracking-tight">
        <LogoDropShopEntete size={88} />
        <span className="texte-dropshop">Créer votre boutique, écrite par l'IA</span>
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-gray-400">
        Discutez avec l'IA : votre logo, votre univers, vos produits. Elle vous propose trois boutiques, vous choisissez
        la vôtre et la retouchez, puis elle l'écrit entièrement — design unique, responsive, panier, commande, emails,
        paiement Stripe — sans aucune mention DropShipper.{' '}
        <b className="text-gray-200">Payée une seule fois, à vie, et modifiable à volonté.</b>
      </p>

      {/* ---------- Vos boutiques : une pastille par boutique ---------- */}
      {hebergees.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {hebergees.map((b) => {
            const logo = b.vitrineLogoEntete ?? b.vitrineLogoAccueil ?? b.logo
            const estActive = active?.id === b.id
            return (
              <div
                key={b.id}
                className={`group flex items-center gap-2 rounded-full border py-1 pl-1 pr-2 transition ${estActive ? 'border-violet-300/70 bg-violet-400/15' : 'border-white/10 bg-white/[0.04] hover:border-white/25'}`}
              >
                <button type="button" onClick={() => setChoisie(b.id)} className="flex items-center gap-2 text-left">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.08]">
                    {logo ? <img src={logo} alt="" className="max-h-6 max-w-6 object-contain" /> : <span className="text-sm font-black text-gray-300">{b.name.slice(0, 1).toUpperCase()}</span>}
                  </span>
                  <span className="max-w-[12rem] truncate text-sm font-bold text-gray-100">{b.name}</span>
                  <span className="text-[11px] text-gray-500">{b.products} annonce(s)</span>
                </button>
                <button type="button" onClick={() => supprimerBoutique(b)} disabled={busy} title={`Supprimer « ${b.name} »`} className="rounded-full p-1 text-gray-500 hover:text-red-300 disabled:opacity-40">
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
          <button
            type="button"
            onClick={() => setChoisie(null)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-bold transition ${active ? 'border-white/10 text-gray-300 hover:bg-white/5' : 'border-violet-300/70 bg-violet-400/15 text-violet-100'}`}
          >
            <Plus size={14} />
            <span>Nouvelle boutique</span>
          </button>
        </div>
      ) : null}

      {active ? <Studio key={active.id} boutique={active} onChange={charger} /> : (
        /* ---------- Le premier écran, comme une invite : le nom, puis la conversation ---------- */
        <section className="mx-auto mt-10 max-w-2xl text-center">
          <p className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Quelle boutique allons-nous créer ?</p>
          <p className="mt-2 text-sm text-gray-400">Donnez-lui un nom : la conversation commence juste après.</p>
          <div className="cadre-dropshop mt-6 flex flex-col gap-2 rounded-3xl p-2 sm:flex-row">
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && creer()}
              placeholder="Maison Lumea, TechNomade…"
              className="min-w-0 flex-1 rounded-2xl bg-transparent px-4 py-3 text-base text-white outline-none placeholder:text-gray-500"
            />
            <button
              type="button"
              onClick={creer}
              disabled={busy || !nom.trim()}
              className="btn-dropshop inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-40"
            >
              <ArrowUp size={16} />
              <span>{busy ? 'Un instant…' : 'Commencer'}</span>
            </button>
          </div>
          {erreur ? <p className="mt-3 text-xs text-red-400">{erreur}</p> : null}
          <ul className="mx-auto mt-8 grid max-w-xl grid-cols-1 gap-2 text-left text-xs text-gray-400 sm:grid-cols-3">
            <li className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><b className="block text-gray-200">1. Vous racontez</b>Logo, univers, produits : quelques messages suffisent.</li>
            <li className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><b className="block text-gray-200">2. Trois propositions</b>Vous choisissez la vôtre et retouchez ses couleurs.</li>
            <li className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><b className="block text-gray-200">3. L'IA l'écrit</b>En ligne en quelques minutes, modifiable à volonté.</li>
          </ul>
        </section>
      )}

      {active && erreur ? <p className="mt-3 text-xs text-red-400">{erreur}</p> : null}

      <p className="mt-8 text-xs text-gray-500">
        Vos produits se rangent par boutique à l'import ; commandes dans{' '}
        <Link to="/orders" className="text-purple-300 underline">Commandes</Link> ; logos, filigrane et rayons dans{' '}
        <Link to="/mes-sites" className="inline-flex items-center gap-1 text-purple-300 underline">
          <span>Mes sites</span>
          <ArrowRight size={11} />
        </Link>
        .
      </p>
    </Layout>
  )
}

/* ====================================================================== */

const ETAPES: Record<string, string> = {
  ecriture: "L'IA dessine et écrit votre boutique…",
  verification: 'Elle la teste comme un visiteur : accueil, catégories, fiche, panier, commande…',
  reparation: 'Elle corrige ce que le test a relevé…',
  finition: 'Second regard de direction artistique : matière, relief, photos, boutons, mouvement…',
  termine: 'Terminé.',
  echec: 'Échec.',
}

/** Ce que l'IA annonce à chaque étape franchie : un toast, et une notification du navigateur à la fin. */
const ANNONCES: Record<string, string> = {
  ecriture: "L'IA a commencé à écrire votre boutique.",
  verification: 'Écriture terminée : l’IA teste la boutique comme un visiteur.',
  reparation: 'Le test a relevé des points : l’IA les corrige.',
  finition: 'Dernier regard de direction artistique.',
}

/** Les étapes de la conversation de création, dans l'ordre. */
type EtapeChat = 'logo' | 'charte' | 'univers' | 'produits' | 'propositions' | 'retouches'
const ORDRE: EtapeChat[] = ['logo', 'charte', 'univers', 'produits', 'propositions', 'retouches']

/** Les couleurs d'une proposition que le vendeur peut retoucher, avec leur nom à l'écran. */
const RETOUCHABLES = [
  ['fond', 'Fond'],
  ['surface', 'Cartes'],
  ['texte', 'Texte'],
  ['accent', 'Accent'],
  ['accent2', 'Second accent'],
] as const

function euros(drops: number): string {
  return (drops / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: drops % 100 ? 2 : 0 })
}

function demanderNotifications() {
  try {
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
  } catch { /* navigateur sans notifications : les toasts suffisent */ }
}

function notifierNavigateur(titre: string, corps: string) {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(titre, { body: corps })
  } catch { /* idem */ }
}

/**
 * Le studio, à la manière de Lovable (13/10/2026, demande de Max) : avant la
 * création, une conversation au centre — le logo, la charte qui s'adapte ou
 * non, l'univers, les produits — puis trois propositions ; le vendeur en
 * choisit une, retouche ses couleurs, et lance. Pendant l'écriture : les
 * étapes arrivent en notifications, le back-office s'achète, et l'encart
 * DropShop Market rappelle où iront ses produits. Une fois créée : la
 * conversation à gauche (chaque version y est un échange), l'aperçu réel à
 * droite, et des modifications à volonté.
 */
function Studio({ boutique, onChange }: { boutique: Boutique; onChange: () => void }) {
  const [etat, setEtat] = useState<EtatDropShop | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [demande, setDemande] = useState('')
  const [busy, setBusy] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [voirClassique, setVoirClassique] = useState(false)
  const [cle, setCle] = useState('')
  const [copie, setCopie] = useState(false)
  const [rechargement, setRechargement] = useState(0)
  const versionVue = useRef<number>(-1)
  // La conversation de création : où on en est, et ce que le vendeur a dit.
  const [etape, setEtape] = useState<EtapeChat>('logo')
  const [univers, setUnivers] = useState('')
  const [produits, setProduits] = useState('')
  const [retouche, setRetouche] = useState('')
  // Le logo, ses couleurs, la gamme choisie, l'expérience immersive.
  const [logos, setLogos] = useState<{ entete: string | null; accueil: string | null }>({ entete: boutique.vitrineLogoEntete, accueil: boutique.vitrineLogoAccueil })
  const [gammes, setGammes] = useState<{ logo: boolean; couleurs: Array<{ hex: string; part: number }>; gammes: GammeDropShop[] } | null>(null)
  const [gammeChoisie, setGammeChoisie] = useState<string | null>(null)
  const [modesVisiteur, setModesVisiteur] = useState(false)
  const [chargeLogo, setChargeLogo] = useState<'entete' | 'accueil' | null>(null)
  // Les trois propositions, et celle que le vendeur choisit (et retouche).
  const [directions, setDirections] = useState<DirectionDropShop[]>([])
  const [directionChoisie, setDirectionChoisie] = useState<string | null>(null)
  const [chercheDirections, setChercheDirections] = useState(false)
  const [toasts, setToasts] = useState<Array<{ id: number; texte: string; fin?: boolean }>>([])
  const derniereEtape = useRef<string | null>(null)
  const basDuChat = useRef<HTMLDivElement | null>(null)

  const brief = [
    univers.trim(),
    produits.trim() ? `Produits à vendre : ${produits.trim()}` : '',
  ].filter(Boolean).join('\n\n')

  function avancer(depuis: EtapeChat) {
    let i = ORDRE.indexOf(depuis) + 1
    // Sans logo, pas de question sur la charte : l'IA compose librement.
    if (ORDRE[i] === 'charte' && !gammes?.logo) i += 1
    setEtape(ORDRE[i] ?? 'retouches')
  }

  async function proposerDirections() {
    if (brief.length < 20) return setErreur('Dites-m’en un peu plus sur votre univers et vos produits.')
    setChercheDirections(true)
    setErreur(null)
    setDirections([])
    setDirectionChoisie(null)
    try {
      const gamme = gammes?.gammes.find((g) => g.id === gammeChoisie) ?? null
      const r = await api.dropshopDirections(boutique.id, { description: brief, gamme: gamme ? { nom: gamme.nom, mode: gamme.mode, jetons: gamme.jetons } : null })
      setDirections(r.directions)
      // Les polices des trois directions, demandées à Google pour l'aperçu.
      const familles = [...new Set(r.directions.flatMap((d) => [d.polices.titre, d.polices.texte]))]
      const lien = document.createElement('link')
      lien.rel = 'stylesheet'
      lien.href = 'https://fonts.googleapis.com/css2?' + familles.map((f) => 'family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@400;700').join('&') + '&display=swap'
      document.head.appendChild(lien)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Propositions indisponibles')
    } finally {
      setChercheDirections(false)
    }
  }

  function retoucherCouleur(id: string, cle: (typeof RETOUCHABLES)[number][0], valeur: string) {
    setDirections((ds) => ds.map((d) => (d.id === id ? { ...d, palette: { ...d.palette, [cle]: valeur } } : d)))
  }

  const analyserLogo = useCallback(async () => {
    try {
      const g = await api.dropshopGammes(boutique.id)
      setGammes(g)
      // Sans logo, pas de proposition « adapter aux couleurs » : l'IA reste libre.
      if (!g.logo) setGammeChoisie(null)
    } catch {
      setGammes(null)
    }
  }, [boutique.id])

  async function televerserLogo(emplacement: 'entete' | 'accueil', fichier: File | null) {
    if (!fichier) return
    setChargeLogo(emplacement)
    setErreur(null)
    try {
      const r = await api.uploadVitrineLogo(boutique.id, emplacement, fichier)
      setLogos((l) => ({ ...l, [emplacement]: r.logo }))
      onChange()
      await analyserLogo()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Logo refusé')
    } finally {
      setChargeLogo(null)
    }
  }

  async function retirerLogo(emplacement: 'entete' | 'accueil') {
    setChargeLogo(emplacement)
    try {
      await api.deleteVitrineLogo(boutique.id, emplacement)
      setLogos((l) => ({ ...l, [emplacement]: null }))
      onChange()
      await analyserLogo()
    } finally {
      setChargeLogo(null)
    }
  }

  const relire = useCallback(async () => {
    try {
      const e = await api.dropshopEtat(boutique.id)
      setEtat(e)
      if (versionVue.current !== -1 && e.version !== versionVue.current) setRechargement((n) => n + 1)
      versionVue.current = e.version
      return e
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'État indisponible')
      return null
    }
  }, [boutique.id])

  useEffect(() => {
    versionVue.current = -1
    setEtat(null)
    void relire()
    void analyserLogo()
  }, [relire, analyserLogo])

  // Une boutique déjà décrite (retirée puis reprise) : son brief revient dans la conversation.
  useEffect(() => {
    if (etat?.brief && !univers) setUnivers(etat.brief)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat?.brief])

  const enCours = Boolean(etat?.travail && !etat.travail.fin)
  useEffect(() => {
    if (!enCours) return
    const t = setInterval(() => void relire(), 3000)
    return () => clearInterval(t)
  }, [enCours, relire])

  // Les notifications : un toast à chaque étape franchie, et celle du navigateur à la fin.
  const travailEtape = etat?.travail ? `${etat.travail.debut}|${etat.travail.etape}` : null
  useEffect(() => {
    const t = etat?.travail
    if (!t || !travailEtape) return
    const avant = derniereEtape.current
    derniereEtape.current = travailEtape
    // Premier regard sur un travail déjà fini : rien à annoncer.
    if (avant === null && t.fin) return
    if (avant === travailEtape) return
    const creation = t.type === 'creation'
    let texte = ANNONCES[t.etape] ?? ''
    if (t.etape === 'termine') texte = creation ? `${boutique.name} est en ligne !` : 'Votre modification est en ligne.'
    if (t.etape === 'echec') texte = creation ? 'La création a échoué : vos drops vous sont rendus.' : 'La modification a échoué : la boutique est restée telle quelle.'
    if (t.etape === 'ecriture' && !creation) texte = 'L’IA applique votre demande.'
    if (!texte) return
    const id = Date.now()
    setToasts((l) => [...l.slice(-2), { id, texte, fin: Boolean(t.fin) }])
    setTimeout(() => setToasts((l) => l.filter((x) => x.id !== id)), 6000)
    if (t.fin) notifierNavigateur(creation ? 'DropShop IA' : boutique.name, texte)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travailEtape])

  // La conversation descend d'elle-même quand un message arrive.
  const nbMessages = (etat?.versions.length ?? 0) + (etat?.travail ? 1 : 0)
  useEffect(() => { basDuChat.current?.scrollIntoView({ block: 'nearest' }) }, [nbMessages, etape, directions.length, etat?.travail?.etape])

  // Arrivé aux propositions, l'IA les compose sans qu'on le lui demande.
  useEffect(() => {
    if (etape === 'propositions' && !directions.length && !chercheDirections && brief.length >= 20) void proposerDirections()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape])

  async function lancerCreation() {
    if (!etat) return
    setBusy(true)
    setErreur(null)
    demanderNotifications()
    try {
      const gamme = gammes?.gammes.find((g) => g.id === gammeChoisie) ?? null
      const direction = directions.find((d) => d.id === directionChoisie) ?? null
      const description = retouche.trim() && direction
        ? `${brief}\n\nRetouches demandées sur la proposition « ${direction.titre} » : ${retouche.trim()}`
        : brief
      await api.dropshopCreer(boutique.id, { description, gamme: gamme ? { nom: gamme.nom, mode: gamme.mode, jetons: gamme.jetons } : null, modesVisiteur, direction })
      await relire()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Création impossible')
    } finally {
      setBusy(false)
    }
  }

  async function lancerModification() {
    if (!etat || !demande.trim()) return
    setBusy(true)
    setErreur(null)
    demanderNotifications()
    try {
      await api.dropshopModifier(boutique.id, demande.trim())
      setDemande('')
      await relire()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Modification impossible')
    } finally {
      setBusy(false)
    }
  }

  async function restaurer(numero: number) {
    setBusy(true)
    setErreur(null)
    try {
      await api.dropshopRestaurer(boutique.id, numero)
      await relire()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Restauration impossible')
    } finally {
      setBusy(false)
    }
  }

  async function retirer() {
    if (!window.confirm('Retirer la boutique IA ? La vitrine à thèmes reprendra à la même adresse. Vos versions restent et se restaurent à tout moment.')) return
    setBusy(true)
    try {
      await api.dropshopRetirer(boutique.id)
      await relire()
      onChange()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Retrait impossible')
    } finally {
      setBusy(false)
    }
  }

  async function brancherStripe() {
    setBusy(true)
    setErreur(null)
    try {
      await api.dropshopStripe(boutique.id, cle.trim())
      setCle('')
      await relire()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Clé refusée')
    } finally {
      setBusy(false)
    }
  }

  async function debrancherStripe() {
    setBusy(true)
    try {
      await api.dropshopStripeRetirer(boutique.id)
      await relire()
    } finally {
      setBusy(false)
    }
  }

  function copierAdresse() {
    if (!etat?.adresse) return
    navigator.clipboard?.writeText(etat.adresse).then(() => {
      setCopie(true)
      setTimeout(() => setCopie(false), 1500)
    })
  }

  if (!etat) return <p className="mt-6 text-xs text-gray-500">Chargement du studio…</p>

  const travail = etat.travail
  const apercu = etat.adresse ? `${etat.adresse}?v=${etat.version}-${rechargement}` : null
  const creationEnCours = enCours && travail?.type === 'creation'
  const rang = ORDRE.indexOf(etape)
  const passe = (e: EtapeChat) => ORDRE.indexOf(e) < rang
  const choisie = directions.find((d) => d.id === directionChoisie) ?? null
  const gamme = gammes?.gammes.find((g) => g.id === gammeChoisie) ?? null
  const prixCreation = `${etat.tarifs.creation} drops (${euros(etat.tarifs.creation)})`
  const modifsLibres = etat.tarifs.illimitees || etat.tarifs.modification === 0

  const notifications = <Toasts toasts={toasts} />

  /* ---------------- 1. Avant la création : la conversation, au centre ---------------- */
  if (!etat.creee && !enCours) {
    return (
      <div className="mx-auto mt-6 max-w-4xl">
        {notifications}
        <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 sm:p-7">
          <div className="space-y-5">
            {etat.versions.length > 0 ? (
              <BulleIA>
                Cette boutique a déjà {etat.versions.length} version(s) écrite(s) par l'IA.{' '}
                <button type="button" className="font-semibold text-violet-200 underline" onClick={() => restaurer(etat.versions[0].numero)} disabled={busy}>
                  Remettre la dernière en ligne
                </button>{' '}
                ne coûte rien. Sinon, recommençons ensemble.
              </BulleIA>
            ) : null}

            {travail?.type === 'creation' && travail.etape === 'echec' ? <Avancement travail={travail} /> : null}

            {/* --- Le logo --- */}
            <BulleIA>
              Bonjour ! Je vais créer <b className="text-white">{boutique.name}</b> avec vous. Commençons :{' '}
              <b className="text-white">déposez votre logo</b>. Je lis ses couleurs pour vous proposer une charte qui lui va.
            </BulleIA>
            {etape === 'logo' ? (
              <Saisie>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(['entete', 'accueil'] as const).map((emplacement) => (
                    <div key={emplacement} className="rounded-xl border border-dashed border-white/15 bg-black/20 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{emplacement === 'entete' ? 'Votre logo' : 'Grand, sur l\'accueil (facultatif)'}</p>
                      <div className="mt-2 flex h-20 items-center justify-center rounded-lg bg-white/[0.06]">
                        {logos[emplacement] ? <img src={logos[emplacement] ?? ''} alt="" className="max-h-16 max-w-[90%] object-contain" /> : <ImageIcon size={22} className="text-gray-600" />}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <label className="cursor-pointer rounded-lg border border-white/10 px-2.5 py-1 text-xs text-gray-200 hover:bg-white/5">
                          {chargeLogo === emplacement ? 'Envoi…' : logos[emplacement] ? 'Remplacer' : 'Choisir un fichier'}
                          <input type="file" accept="image/png,image/svg+xml,image/webp,image/jpeg" className="hidden" onChange={(e) => televerserLogo(emplacement, e.target.files?.[0] ?? null)} />
                        </label>
                        {logos[emplacement] ? <button type="button" onClick={() => retirerLogo(emplacement)} className="text-xs text-gray-500 underline hover:text-red-300">Retirer</button> : null}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-gray-500">PNG, SVG, WebP ou JPEG, fond transparent de préférence.</p>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {!logos.entete && !logos.accueil ? (
                    <button type="button" onClick={() => avancer('logo')} className="rounded-full border border-white/10 px-4 py-2 text-xs text-gray-300 hover:bg-white/5">
                      Je n'ai pas de logo
                    </button>
                  ) : null}
                  <BoutonSuivant onClick={() => avancer('logo')} disabled={(!logos.entete && !logos.accueil) || chargeLogo !== null}>Continuer</BoutonSuivant>
                </div>
              </Saisie>
            ) : (
              <BulleClient onModifier={() => setEtape('logo')}>
                {logos.entete || logos.accueil ? (
                  <img src={logos.entete ?? logos.accueil ?? ''} alt="Votre logo" className="max-h-14 max-w-[12rem] object-contain" />
                ) : 'Pas de logo pour l’instant.'}
              </BulleClient>
            )}

            {/* --- La charte s'adapte, ou pas --- */}
            {rang >= ORDRE.indexOf('charte') && gammes?.logo ? (
              <>
                <BulleIA>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span>J'ai lu les couleurs de votre logo :</span>
                    {gammes.couleurs.map((c) => (
                      <span key={c.hex} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-1.5 py-0.5">
                        <span className="inline-block h-3 w-3 rounded-full" style={{ background: c.hex }} />
                        <span className="text-[11px] text-gray-300">{c.hex}</span>
                      </span>
                    ))}
                  </span>
                  <span className="mt-1 block">La charte de la boutique s'adapte à votre logo, ou je compose librement ?</span>
                </BulleIA>
                {etape === 'charte' ? (
                  <Saisie>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {gammes.gammes.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => { setGammeChoisie(g.id ?? null); avancer('charte') }}
                          className={`rounded-xl border p-2.5 text-left transition ${gammeChoisie === g.id ? 'border-violet-300 bg-violet-400/10' : 'border-white/10 hover:bg-white/5'}`}
                        >
                          <span className="flex items-center gap-1.5">
                            {(['fond', 'surface', 'accent', 'accent2', 'texte'] as const).map((k) => (
                              <span key={k} className="inline-block h-5 w-5 rounded-md border border-white/10" style={{ background: g.jetons[k] }} />
                            ))}
                            <span className="ml-auto text-sm font-bold text-gray-100">{g.nom}</span>
                          </span>
                          <span className="mt-1 block text-[11px] leading-snug text-gray-400">{g.description}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button type="button" onClick={() => { setGammeChoisie(null); avancer('charte') }} className="rounded-full border border-white/10 px-4 py-2 text-xs text-gray-300 hover:bg-white/5">
                        Non, composez librement
                      </button>
                    </div>
                  </Saisie>
                ) : passe('charte') ? (
                  <BulleClient onModifier={() => setEtape('charte')}>
                    {gamme ? (
                      <span className="flex items-center gap-1.5">
                        <span>Oui, la gamme « {gamme.nom} »</span>
                        {(['fond', 'accent', 'accent2'] as const).map((k) => <span key={k} className="inline-block h-3.5 w-3.5 rounded-full" style={{ background: gamme.jetons[k] }} />)}
                      </span>
                    ) : 'Non, composez librement.'}
                  </BulleClient>
                ) : null}
              </>
            ) : null}

            {/* --- L'univers --- */}
            {rang >= ORDRE.indexOf('univers') ? (
              <>
                <BulleIA>
                  <b className="text-white">Dites-m'en plus sur votre univers</b> : l'ambiance, les couleurs, à qui vous vendez, ce qui vous inspire.
                  Plus c'est précis, plus la boutique vous ressemble.
                </BulleIA>
                {etape === 'univers' ? (
                  <Saisie>
                    <ZoneMessage
                      valeur={univers}
                      onChange={setUnivers}
                      onEnvoyer={() => avancer('univers')}
                      min={10}
                      placeholder="Ex. Ambiance atelier d'horloger : bois sombre, laiton, noir profond, typographie élégante. Clientèle 25-45 ans, urbaine. Un ton sobre, sûr de lui, sans superlatifs."
                    />
                  </Saisie>
                ) : passe('univers') ? <BulleClient onModifier={() => setEtape('univers')}>{univers}</BulleClient> : null}
              </>
            ) : null}

            {/* --- Les produits --- */}
            {rang >= ORDRE.indexOf('produits') ? (
              <>
                <BulleIA>
                  <b className="text-white">Quels produits voulez-vous vendre ?</b>{' '}
                  {boutique.products > 0
                    ? `Les ${boutique.products} annonce(s) déjà rangée(s) dans cette boutique la rempliront.`
                    : 'Les annonces que vous rangerez dans cette boutique la rempliront ensuite.'}
                </BulleIA>
                {etape === 'produits' ? (
                  <Saisie>
                    <ZoneMessage
                      valeur={produits}
                      onChange={setProduits}
                      onEnvoyer={() => { setDirections([]); avancer('produits') }}
                      min={3}
                      placeholder="Ex. Des montres et bijoux en acier pour hommes, quelques écouteurs haut de gamme."
                    />
                  </Saisie>
                ) : passe('produits') ? <BulleClient onModifier={() => setEtape('produits')}>{produits}</BulleClient> : null}
              </>
            ) : null}

            {/* --- Les trois propositions --- */}
            {rang >= ORDRE.indexOf('propositions') ? (
              <>
                <BulleIA>
                  {chercheDirections ? (
                    <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Je compose trois propositions pour {boutique.name}…</span>
                  ) : directions.length ? (
                    <>Voici <b className="text-white">trois propositions</b>. Choisissez celle qui vous ressemble : vous pourrez la retoucher.</>
                  ) : (
                    <>Je n'ai pas pu composer les propositions.{' '}
                      <button type="button" onClick={proposerDirections} className="font-semibold text-violet-200 underline">Réessayer</button>
                    </>
                  )}
                </BulleIA>
                {chercheDirections ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {[0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl border border-white/10 bg-white/[0.05]" />)}
                  </div>
                ) : directions.length ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      {directions.map((d) => (
                        <CarteProposition
                          key={d.id}
                          direction={d}
                          nom={boutique.name}
                          choisie={directionChoisie === d.id}
                          onChoisir={() => { setDirectionChoisie(d.id); setEtape('retouches') }}
                        />
                      ))}
                    </div>
                    {etape === 'propositions' ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={proposerDirections} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-xs text-gray-300 hover:bg-white/5">
                          <RotateCcw size={12} />
                          <span>Trois autres propositions</span>
                        </button>
                        <button type="button" onClick={() => { setDirectionChoisie(null); setEtape('retouches') }} className="rounded-full border border-white/10 px-4 py-2 text-xs text-gray-300 hover:bg-white/5">
                          Laisser l'IA libre
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}

            {/* --- La proposition retenue, à retoucher, puis la création --- */}
            {etape === 'retouches' ? (
              <>
                <BulleClient onModifier={() => setEtape('propositions')}>
                  {choisie ? `Je prends « ${choisie.titre} ».` : 'Laissez l’IA libre.'}
                </BulleClient>
                <BulleIA>
                  {choisie
                    ? <>Bon choix. <b className="text-white">Retouchez-la</b> si vous voulez : ses couleurs ci-dessous, ou dites-moi ce qui doit changer. Puis je l'écris.</>
                    : <>Entendu, je compose librement. Une précision avant d'écrire ?</>}
                </BulleIA>
                <Saisie>
                  {choisie ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
                      <CarteProposition direction={choisie} nom={boutique.name} choisie grande />
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Couleurs</p>
                        {RETOUCHABLES.map(([k, label]) => (
                          <label key={k} className="flex items-center gap-2 text-xs text-gray-300">
                            <input
                              type="color"
                              value={/^#[0-9a-fA-F]{6}$/.test(choisie.palette[k]) ? choisie.palette[k] : '#000000'}
                              onChange={(e) => retoucherCouleur(choisie.id, k, e.target.value)}
                              className="h-7 w-9 cursor-pointer rounded border border-white/15 bg-transparent"
                            />
                            <span>{label}</span>
                            <code className="ml-auto text-[10px] text-gray-500">{choisie.palette[k]}</code>
                          </label>
                        ))}
                        <p className="pt-1 text-[11px] text-gray-500">Polices : {choisie.polices.titre} + {choisie.polices.texte}</p>
                      </div>
                    </div>
                  ) : null}
                  <textarea
                    value={retouche}
                    onChange={(e) => setRetouche(e.target.value)}
                    rows={2}
                    placeholder={choisie ? 'Ex. Un héros plus lumineux, des titres moins grands, une section sur la livraison…' : 'Ce que l’IA doit absolument savoir…'}
                    className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm leading-relaxed outline-none transition focus:border-violet-400/70"
                  />
                  <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                    <input type="checkbox" checked={modesVisiteur} onChange={(e) => setModesVisiteur(e.target.checked)} className="mt-0.5 h-4 w-4 accent-violet-400" />
                    <span className="text-xs leading-relaxed text-gray-300">
                      <b className="text-gray-100">Expérience client immersive.</b> Vos visiteurs choisissent l'ambiance de la boutique
                      depuis un sélecteur dans l'en-tête : quatre assemblages de couleurs dessinés pour votre commerce. Leur choix est mémorisé.
                    </span>
                  </label>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-gray-400">
                      <b className="text-violet-200">{prixCreation}</b>, une seule fois · modifications à volonté · en ligne en 4 à 6 minutes
                    </span>
                    <button
                      type="button"
                      onClick={lancerCreation}
                      disabled={busy || brief.length < 20}
                      className="btn-dropshop inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold uppercase tracking-wide text-white shadow-lg shadow-fuchsia-900/30 transition hover:brightness-110 disabled:opacity-40"
                    >
                      <Sparkles size={15} />
                      <span>{busy ? 'Lancement…' : 'Créer ma boutique'}</span>
                    </button>
                  </div>
                </Saisie>
              </>
            ) : null}

            {erreur ? <p className="text-xs text-red-400">{erreur}</p> : null}
            <div ref={basDuChat} />
          </div>
        </div>
      </div>
    )
  }

  /* ---------------- 2. Pendant l'écriture : notifications, back-office, Market ---------------- */
  if (creationEnCours && travail) {
    return (
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {notifications}
        <div className="space-y-4">
          <div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <BulleClient>
              <span className="line-clamp-6 whitespace-pre-line">{travail.demande}</span>
            </BulleClient>
            <BulleIA>C'est parti : j'écris <b className="text-white">{boutique.name}</b>. Je vous préviens à chaque étape, et vous pouvez quitter la page, le travail continue.</BulleIA>
            <Avancement travail={travail} />
          </div>
          <EncartMarket />
        </div>
        <div className="min-w-0 space-y-4">
          <Chantier nom={boutique.name} etape={travail.etape} />
          <Extensions shopId={boutique.id} busy={busy} seulement="back-office" />
        </div>
      </div>
    )
  }

  /* ---------------- 3. La boutique existe : conversation à gauche, aperçu à droite ---------------- */
  const versions = [...etat.versions].reverse()
  return (
    <div className="mt-6 space-y-6">
      {notifications}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="flex min-h-[560px] flex-col rounded-3xl border border-white/10 bg-white/[0.04] lg:h-[78vh]">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <IconeDropShop size={22} />
            <span className="text-sm font-bold text-gray-100">{boutique.name}</span>
            <span className="ml-auto text-[11px] text-gray-500">{modifsLibres ? 'Modifications à volonté' : `${etat.tarifs.modification} drops la modification`}</span>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            {versions.map((v) => (
              <div key={v.numero} className="space-y-2">
                <BulleClient>
                  <span className="line-clamp-5 whitespace-pre-line" title={v.demande}>{v.demande}</span>
                </BulleClient>
                <BulleIA>
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{v.numero === 1 ? 'Boutique créée' : 'Modification appliquée'} : version {v.numero}.</span>
                    {v.numero === etat.version ? (
                      <span className="rounded-full bg-violet-400/20 px-2 py-0.5 text-[10px] font-bold text-violet-200">En ligne</span>
                    ) : etat.creee ? (
                      <button type="button" onClick={() => restaurer(v.numero)} disabled={busy || enCours} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-gray-300 hover:bg-white/5 disabled:opacity-40">
                        <RotateCcw size={11} />
                        <span>Rétablir</span>
                      </button>
                    ) : null}
                  </span>
                  <span className="block text-[11px] text-gray-500">{new Date(v.createdAt).toLocaleString('fr-FR')}</span>
                </BulleIA>
              </div>
            ))}
            {travail && (enCours || travail.etape === 'echec') ? (
              <>
                {enCours ? <BulleClient><span className="line-clamp-4">{travail.demande}</span></BulleClient> : null}
                <Avancement travail={travail} />
              </>
            ) : null}
            {erreur ? <p className="text-xs text-red-400">{erreur}</p> : null}
            <div ref={basDuChat} />
          </div>
          <div className="border-t border-white/10 p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-black/30 p-2 focus-within:border-violet-400/70">
              <textarea
                value={demande}
                onChange={(e) => setDemande(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void lancerModification() } }}
                rows={2}
                disabled={enCours}
                placeholder={enCours ? 'L’IA travaille…' : '« Rends l’en-tête plus sombre », « ajoute une section livraison »…'}
                className="min-w-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-relaxed outline-none placeholder:text-gray-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={lancerModification}
                disabled={busy || enCours || demande.trim().length < 3}
                title="Envoyer"
                className="btn-dropshop inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-gray-500">Entrée pour envoyer · chaque modification devient une version, à rétablir quand vous voulez.</p>
          </div>
        </div>

        <Apercu
          nom={boutique.name}
          adresse={etat.adresse}
          apercu={apercu && (etat.creee || etat.versions.length === 0) ? apercu : null}
          creee={etat.creee}
          version={etat.version}
          mobile={mobile}
          setMobile={setMobile}
          copie={copie}
          onCopier={copierAdresse}
        />
      </div>
      {etat.creee && boutique.products === 0 ? (
        <p className="text-xs text-amber-300/90">
          Aucune annonce n'est rangée dans cette boutique : la page est belle mais vide. Importez ou rangez des annonces dedans, puis publiez-les sur « Mon site ».
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Extensions shopId={boutique.id} busy={busy} />
        <div className="space-y-4">
          <EncartMarket />
          {/* ---------- Stripe ---------- */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <CreditCard size={15} className="text-sky-300" />
              <span>Paiement en ligne</span>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${etat.stripe ? 'bg-violet-400/20 text-violet-200' : 'bg-white/10 text-gray-400'}`}>
                {etat.stripe ? 'Stripe branché' : 'À brancher'}
              </span>
            </h3>
            <p className="mt-1 text-xs text-gray-400">
              Vos clients paient par carte chez Stripe, <b className="text-gray-200">sur votre compte</b> — l'argent
              arrive chez vous, nous ne prenons rien. Collez la clé secrète de votre compte Stripe (Développeurs › Clés
              API, elle commence par <code className="rounded bg-black/30 px-1">sk_live_</code>). Sans clé, la boutique
              enregistre la commande et vous encaissez comme vous voulez.
            </p>
            {etat.stripe ? (
              <button type="button" onClick={debrancherStripe} disabled={busy} className="mt-3 text-xs text-gray-400 underline hover:text-gray-200">
                Débrancher Stripe
              </button>
            ) : (
              <div className="mt-3 flex gap-2">
                <input
                  type="password"
                  value={cle}
                  onChange={(e) => setCle(e.target.value)}
                  placeholder="sk_live_…"
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none transition focus:border-sky-400/70"
                />
                <button type="button" onClick={brancherStripe} disabled={busy || !cle.trim()} className="rounded-xl border border-sky-400/40 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-400/10 disabled:opacity-40">
                  Brancher
                </button>
              </div>
            )}
          </section>

          {etat.creee ? (
            <button type="button" onClick={retirer} disabled={busy || enCours} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-300 disabled:opacity-40">
              <Trash2 size={12} />
              <span>Revenir à la vitrine à thèmes</span>
            </button>
          ) : null}

          <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <button type="button" onClick={() => setVoirClassique((v) => !v)} className="flex w-full items-center gap-2 text-left text-xs font-semibold text-gray-400">
              <span>Ancienne vitrine à thèmes (repli sans boutique IA)</span>
              <ChevronDown size={14} className={`ml-auto transition ${voirClassique ? 'rotate-180' : ''}`} />
            </button>
            {voirClassique ? <div className="mt-3"><VitrineBlock shop={boutique as never} onSaved={onChange} /></div> : null}
          </section>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Les pièces de la conversation ---------------- */

function BulleIA({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="degrade-dropshop mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-md">
        <Sparkles size={15} />
      </span>
      <div className="min-w-0 max-w-2xl rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm leading-relaxed text-gray-200">
        {children}
      </div>
    </div>
  )
}

function BulleClient({ children, onModifier }: { children: ReactNode; onModifier?: () => void }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="max-w-xl rounded-2xl rounded-tr-md bg-violet-500/25 px-4 py-2.5 text-sm leading-relaxed text-white">
        {children}
      </div>
      {onModifier ? (
        <button type="button" onClick={onModifier} className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300">
          <Pencil size={10} />
          <span>Modifier</span>
        </button>
      ) : null}
    </div>
  )
}

/** Ce que le vendeur remplit à l'étape en cours : aligné sous la bulle de l'IA. */
function Saisie({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-violet-400/25 bg-violet-500/[0.06] p-3 sm:ml-11 sm:p-4">{children}</div>
}

function BoutonSuivant({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="btn-dropshop inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-40">
      <span>{children}</span>
      <ArrowRight size={13} />
    </button>
  )
}

function ZoneMessage({ valeur, onChange, onEnvoyer, placeholder, min }: { valeur: string; onChange: (v: string) => void; onEnvoyer: () => void; placeholder: string; min: number }) {
  const pret = valeur.trim().length >= min
  return (
    <div className="flex items-end gap-2">
      <textarea
        autoFocus
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && pret) { e.preventDefault(); onEnvoyer() } }}
        rows={3}
        placeholder={placeholder}
        className="min-w-0 flex-1 resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm leading-relaxed outline-none transition focus:border-violet-400/70"
      />
      <button type="button" onClick={onEnvoyer} disabled={!pret} title="Envoyer" className="btn-dropshop inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition hover:brightness-110 disabled:opacity-40">
        <ArrowUp size={17} />
      </button>
    </div>
  )
}

function CarteProposition({ direction: d, nom, choisie, onChoisir, grande }: { direction: DirectionDropShop; nom: string; choisie: boolean; onChoisir?: () => void; grande?: boolean }) {
  const p = d.palette
  const contenu = (
    <>
      <div
        className={`relative px-4 pb-4 pt-5 ${grande ? 'min-h-[13rem]' : 'min-h-[11rem]'}`}
        style={{
          background: `radial-gradient(90% 70% at 70% 0%, ${p.accent}44, transparent 60%), linear-gradient(160deg, ${p.surface}, ${p.fond})`,
          color: p.texte,
          fontFamily: `'${d.polices.texte}', system-ui, sans-serif`,
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[.22em]" style={{ color: p.accent }}>{d.titre}</p>
        <p className={`mt-1 font-bold leading-tight ${grande ? 'text-[28px]' : 'text-[22px]'}`} style={{ fontFamily: `'${d.polices.titre}', serif` }}>{nom}</p>
        <p className="mt-1 text-[12px] leading-snug" style={{ color: p.sourd }}>{d.concept}</p>
        <span className="mt-3 inline-block rounded-lg px-3 py-1.5 text-[12px] font-bold" style={{ background: p.accent, color: '#fff', boxShadow: `0 8px 20px -8px ${p.accent}` }}>
          Découvrir la boutique
        </span>
        <span className="absolute right-3 top-3 flex gap-1">
          {(['fond', 'surface', 'accent', 'accent2', 'texte'] as const).map((k) => (
            <span key={k} className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ background: p[k] }} />
          ))}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-white/[0.04] px-4 py-2 text-[11px] text-gray-400">
        <span><b className="text-gray-200">{d.polices.titre}</b> + {d.polices.texte}</span>
        <span>· {d.ambiance}</span>
        {onChoisir ? <span className={`ml-auto font-bold ${choisie ? 'text-violet-300' : 'text-gray-300'}`}>{choisie ? 'Choisie' : 'Choisir'}</span> : null}
      </div>
    </>
  )
  const classe = `block w-full overflow-hidden rounded-2xl border text-left transition ${choisie ? 'border-violet-300 ring-2 ring-violet-400/40' : 'border-white/10 hover:border-white/30'}`
  return onChoisir
    ? <button type="button" onClick={onChoisir} className={classe}>{contenu}</button>
    : <div className={classe}>{contenu}</div>
}

/** Les toasts des étapes, en bas à droite. */
function Toasts({ toasts }: { toasts: Array<{ id: number; texte: string; fin?: boolean }> }) {
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="cadre-dropshop flex items-start gap-2 rounded-2xl px-3 py-2.5 text-sm text-gray-100 shadow-2xl">
          <Bell size={15} className={`mt-0.5 shrink-0 ${t.fin ? 'text-amber-300' : 'text-violet-300'}`} />
          <span>{t.texte}</span>
        </div>
      ))}
    </div>
  )
}

/** L'encart DropShop Market : où iront les produits de la boutique. */
function EncartMarket() {
  return (
    <section className="cadre-dropshop rounded-2xl p-4">
      <p className="texte-dropshop text-[11px] font-black uppercase tracking-[.2em]">DropShop Market</p>
      <h3 className="mt-1 text-base font-extrabold text-white">Vos produits ne restent pas dans votre boutique</h3>
      <p className="mt-1 text-xs leading-relaxed text-gray-300">
        Ils vont aussi sur <b className="text-white">DropShop Market</b>, la marketplace de toutes les boutiques DropShop,
        incluse, rien à installer. Et sur les marketplaces où vous les diffusez : eBay, Kaufland, Fnac, Carrefour, Leclerc…
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href="https://drop-shop.cloud" target="_blank" rel="noreferrer noopener" className="btn-dropshop inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-white hover:brightness-110">
          <ExternalLink size={12} />
          <span>Consulter la marketplace</span>
        </a>
        <Link to="/dropshop-market" className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/5">Mes annonces sur le Market</Link>
        <Link to="/plateformes-vente" className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/5">Diffuser sur les marketplaces</Link>
      </div>
    </section>
  )
}

/** Le cadre d'aperçu pendant l'écriture : la boutique se dessine. */
function Chantier({ nom, etape }: { nom: string; etape: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b10]">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-400">
        <Loader2 size={13} className="animate-spin text-violet-300" />
        <span className="truncate">{ETAPES[etape] ?? 'L’IA travaille…'}</span>
      </div>
      <div className="space-y-3 p-5" aria-hidden="true">
        <div className="flex items-center justify-between">
          <div className="h-5 w-28 animate-pulse rounded bg-white/10" />
          <div className="flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-3 w-12 animate-pulse rounded bg-white/10" />)}</div>
        </div>
        <div className="degrade-dropshop relative h-40 overflow-hidden rounded-xl opacity-30">
          <div className="absolute inset-0 animate-pulse bg-black/30" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-white/[0.07]" style={{ animationDelay: `${i * 150}ms` }} />)}
        </div>
      </div>
      <p className="px-5 pb-5 text-center text-xs text-gray-500">{nom} apparaîtra ici, à sa vraie adresse, dès qu'elle sera en ligne.</p>
    </div>
  )
}

function Apercu({ nom, adresse, apercu, creee, version, mobile, setMobile, copie, onCopier }: {
  nom: string; adresse: string | null; apercu: string | null; creee: boolean; version: number
  mobile: boolean; setMobile: (m: boolean) => void; copie: boolean; onCopier: () => void
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 rounded-t-2xl border border-b-0 border-white/10 bg-white/[0.05] px-3 py-2">
        <div className="flex gap-1 rounded-lg border border-white/10 p-0.5">
          <button type="button" onClick={() => setMobile(false)} title="Ordinateur" className={`rounded-md p-1.5 ${!mobile ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'}`}><Monitor size={15} /></button>
          <button type="button" onClick={() => setMobile(true)} title="Téléphone" className={`rounded-md p-1.5 ${mobile ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'}`}><Smartphone size={15} /></button>
        </div>
        {adresse ? (
          <code className="min-w-0 flex-1 truncate rounded-md bg-black/30 px-2 py-1 text-[11px] text-gray-300">{adresse}</code>
        ) : <span className="text-xs text-gray-500">Adresse posée à la création</span>}
        {creee ? <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-[11px] font-bold text-violet-200">v{version}</span> : null}
        <button type="button" onClick={onCopier} disabled={!adresse} title="Copier l'adresse" className="rounded-md p-1.5 text-gray-400 hover:text-white disabled:opacity-40"><Copy size={15} /></button>
        {copie ? <span className="text-[11px] text-violet-300">Copiée</span> : null}
        <a href={apercu ?? '#'} target="_blank" rel="noreferrer noopener" className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${apercu ? 'text-purple-200 hover:bg-white/10' : 'pointer-events-none text-gray-600'}`}>
          <ExternalLink size={13} />
          <span>Ouvrir</span>
        </a>
      </div>
      <div className={`flex justify-center overflow-hidden rounded-b-2xl border border-white/10 bg-[#0b0b10] ${mobile ? 'py-4' : ''}`} style={{ height: '78vh', minHeight: 560 }}>
        {apercu ? (
          <div className={`relative h-full ${mobile ? 'w-[390px]' : 'w-full'}`}>
            {!creee ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-amber-500/90 px-3 py-1.5 text-center text-[11px] font-bold text-black">
                Ceci est l'ancienne vitrine à thèmes, en attendant : votre boutique écrite par l'IA la remplacera ici, à la même adresse.
              </div>
            ) : null}
            <iframe
              key={apercu}
              title={`Aperçu de ${nom}`}
              src={apercu}
              className={`h-full w-full bg-white ${mobile ? 'rounded-[28px] border-8 border-black/80 shadow-2xl' : ''}`}
            />
          </div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
            <Sparkles size={28} className="text-violet-300" />
            <p className="max-w-md text-sm text-gray-300">L'aperçu de votre boutique apparaîtra ici — la vraie page, à sa vraie adresse, en largeur ordinateur ou téléphone.</p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Les extensions de la boutique — comme les apps Shopify ou les modules
 * PrestaShop, en drops. Un pop-up demande ce que l'extension a besoin de
 * savoir (identifiant, mot de passe…), le vendeur paie, elle est installée.
 */
function Extensions({ shopId, busy, seulement }: { shopId: string; busy: boolean; seulement?: string }) {
  const [liste, setListe] = useState<ExtensionDropShop[]>([])
  const [adresseAdmin, setAdresseAdmin] = useState<string | null>(null)
  const [ouverte, setOuverte] = useState<ExtensionDropShop | null>(null)
  const [champs, setChamps] = useState<Record<string, string>>({})
  const [erreur, setErreur] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)

  const charger = useCallback(() => {
    // Rien d'annoncé qui ne s'installe pas : les extensions « bientôt » ne s'affichent pas (règle de Max du 12/10).
    api.dropshopExtensions(shopId).then((r) => { setListe(r.extensions.filter((e) => e.statut !== 'bientot')); setAdresseAdmin(r.adresseAdmin) }).catch(() => undefined)
  }, [shopId])
  useEffect(charger, [charger])

  async function installer() {
    if (!ouverte) return
    setEnvoi(true)
    setErreur(null)
    try {
      await api.dropshopInstallerExtension(shopId, ouverte.id, champs)
      setOuverte(null)
      setChamps({})
      charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Installation impossible')
    } finally {
      setEnvoi(false)
    }
  }

  async function retirer(ext: ExtensionDropShop) {
    if (!window.confirm(`Retirer « ${ext.nom} » de cette boutique ? Les drops payés ne sont pas rendus.`)) return
    try {
      await api.dropshopRetirerExtension(shopId, ext.id)
      charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Retrait impossible')
    }
  }

  const familles = seulement
    ? ([['dropshop', 'Pendant que l’IA écrit', 'Offrez à votre boutique son administration : commandes, produits et réglages, sans compte DropShipper.']] as const)
    : ([
        ['dropshop', 'Extensions DropShop IA', 'Les nôtres : conçues pour vos boutiques, payables en drops.'],
        ['partenaire', 'Extensions partenaires exclusifs — seulement ici', 'Des partenaires que vous ne trouverez sur aucune autre plateforme.'],
      ] as const)
  const visibles = seulement ? liste.filter((e) => e.id === seulement) : liste
  if (seulement && !visibles.length) return null

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <Puzzle size={15} className="text-purple-300" />
        <span>{seulement ? 'Votre back-office' : 'Extensions'}</span>
        <span className="ml-auto text-[11px] font-normal text-gray-500">Comme les apps Shopify, en drops</span>
      </h3>
      {(familles as ReadonlyArray<readonly [string, string, string]>).filter(([f]) => visibles.some((e) => e.famille === f)).map(([famille, titre, sousTitre]) => (
        <div key={famille} className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-gray-300">{titre}</p>
          <p className="mb-2 text-[11px] text-gray-500">{sousTitre}</p>
          <div className="grid gap-2">
        {visibles.filter((e) => e.famille === famille).map((ext) => (
          <div key={ext.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06] shadow-[0_6px_16px_-8px_rgba(0,0,0,.6)]">
                {ext.logo === 'drops' ? <DropCoin size={34} /> : <img src={ext.logo} alt="" className="h-12 w-12 object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-gray-100">
                  <span>{ext.nom}</span>
                  {ext.exclusif ? <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-black tracking-wider text-amber-200">EXCLUSIVITÉ</span> : null}
                  {ext.mention ? <span className="rounded-full bg-sky-400/20 px-2 py-0.5 text-[10px] font-black tracking-wider text-sky-200">{ext.mention}</span> : null}
                  {ext.statut === 'incluse' ? <span className="rounded-full bg-violet-400/20 px-2 py-0.5 text-[10px] font-bold text-violet-200">Incluse</span> : null}
                  {ext.installee ? <span className="rounded-full bg-violet-400/20 px-2 py-0.5 text-[10px] font-bold text-violet-200">Installée</span> : null}
                </p>
                <p className="text-xs text-gray-400">{ext.accroche}</p>
              </div>
              <span className="shrink-0 text-xs font-bold text-purple-200">{ext.prix === 0 ? 'Gratuite' : `${ext.prix} drops`}</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{ext.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {ext.installee ? (
                <>
                  {ext.apres === 'back-office' && adresseAdmin ? (
                    <a href={adresseAdmin} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 rounded-lg bg-purple-500/20 px-2.5 py-1 text-xs font-bold text-purple-200 hover:bg-purple-500/30">
                      <ExternalLink size={12} />
                      <span>Ouvrir le back-office</span>
                    </a>
                  ) : null}
                  {ext.identifiant ? <span className="text-[11px] text-gray-500">identifiant : {ext.identifiant}</span> : null}
                  <button type="button" onClick={() => retirer(ext)} className="ml-auto text-[11px] text-gray-500 underline hover:text-red-300">Retirer</button>
                </>
              ) : ext.statut === 'disponible' ? (
                <button type="button" onClick={() => { setOuverte(ext); setChamps({}); setErreur(null) }} disabled={busy} className="rounded-lg border border-purple-400/40 px-2.5 py-1 text-xs font-bold text-purple-200 hover:bg-purple-400/10 disabled:opacity-40">
                  Installer · {ext.prix === 0 ? 'gratuit' : `${ext.prix} drops`}
                </button>
              ) : ext.statut === 'incluse' ? (
                <Link to="/dropshop-market" className="text-[11px] text-purple-300 underline">Active d'office, rien à installer : voir mes annonces sur le Market</Link>
              ) : null}
            </div>
          </div>
        ))}
          </div>
        </div>
      ))}
      {erreur && !ouverte ? <p className="mt-2 text-xs text-red-400">{erreur}</p> : null}

      {ouverte ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !envoi && setOuverte(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#14121f] p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-base font-bold text-gray-100">Installer « {ouverte.nom} »</h4>
            <p className="mt-1 text-xs text-gray-400">{ouverte.accroche}</p>
            <div className="mt-4 space-y-3">
              {ouverte.champs.map((c) => (
                <label key={c.cle} className="block text-xs text-gray-300">
                  <span className="font-semibold">{c.label}</span>
                  <input
                    type={c.type}
                    value={champs[c.cle] ?? ''}
                    onChange={(e) => setChamps((x) => ({ ...x, [c.cle]: e.target.value }))}
                    autoComplete={c.type === 'password' ? 'new-password' : 'off'}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-gray-100 outline-none focus:border-purple-400/70"
                  />
                  {c.aide ? <span className="mt-1 block text-[11px] text-gray-500">{c.aide}</span> : null}
                </label>
              ))}
            </div>
            {erreur ? <p className="mt-3 text-xs text-red-400">{erreur}</p> : null}
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-400">{ouverte.prix === 0 ? 'Gratuite' : <><b className="text-purple-200">{ouverte.prix} drops</b>, une fois</>}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOuverte(null)} disabled={envoi} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-gray-300 hover:bg-white/5">Annuler</button>
                <button type="button" onClick={installer} disabled={envoi} className="rounded-xl bg-gradient-to-r from-purple-500 to-fuchsia-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                  {envoi ? 'Installation…' : ouverte.prix === 0 ? 'Installer' : `Payer ${ouverte.prix} drops et installer`}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Avancement({ travail }: { travail: TravailDropShop }) {
  const [, tick] = useState(0)
  const enCours = !travail.fin
  // L'horloge du navigateur n'est pas celle du serveur : un décalage d'une
  // minute affichait « 0 s » pendant toute l'écriture. Le compteur part donc
  // du moment où CET écran a vu le travail, et ne recule jamais.
  const vuA = useRef(Date.now())
  // Un nouveau travail dans le même écran repart de zéro (sinon le compteur
  // héritait du précédent : « 145 s » quatre secondes après le clic).
  useEffect(() => { vuA.current = Date.now() }, [travail.debut])
  useEffect(() => {
    if (!enCours) return
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [enCours])
  const debut = new Date(travail.debut).getTime()
  const secondes = travail.fin
    ? Math.max(0, Math.round((new Date(travail.fin).getTime() - debut) / 1000))
    : Math.max(Math.round((Date.now() - debut) / 1000), Math.round((Date.now() - vuA.current) / 1000), 0)
  const titre = travail.type === 'creation' ? 'Création de la boutique' : 'Modification'

  if (travail.etape === 'echec') {
    return (
      <section className="rounded-2xl border border-red-400/30 bg-red-500/[0.07] p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-red-200"><AlertTriangle size={15} /><span>{titre} : échec</span></h3>
        <p className="mt-1 text-xs text-gray-300">{travail.erreur}</p>
        {travail.echecs?.length ? (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-gray-400">
            {travail.echecs.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        ) : null}
      </section>
    )
  }
  if (travail.etape === 'termine') {
    return (
      <section className="rounded-2xl border border-violet-400/30 bg-violet-500/[0.07] p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-violet-200"><CheckCircle2 size={15} /><span>{titre} : en ligne</span></h3>
        <p className="mt-1 text-xs text-gray-300">{travail.resume ?? 'Terminé.'} <span className="text-gray-500">({secondes} s)</span></p>
        {typeof travail.cout === 'number' ? (
          <p className="mt-1 text-[11px] text-amber-200/90">
            Coût de production (admin) : {travail.cout.toFixed(2)} $ au tarif plein{travail.jetons ? ` — ${Math.round(travail.jetons.entree / 1000)} k jetons lus, ${Math.round(travail.jetons.sortie / 1000)} k écrits` : ''}.
          </p>
        ) : null}
      </section>
    )
  }
  const etapes: Array<[string, string]> = [['ecriture', 'Écriture'], ['verification', 'Test du parcours'], ['reparation', 'Corrections'], ['finition', 'Finition']]
  const rang = etapes.findIndex(([k]) => k === travail.etape)
  return (
    <section className="rounded-2xl border border-violet-400/30 bg-violet-500/[0.07] p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-violet-200">
        <Loader2 size={15} className="animate-spin" />
        <span>{titre} en cours — {secondes} s</span>
      </h3>
      <p className="mt-1 text-xs text-gray-300">
        {travail.type === 'modification' && travail.etape === 'ecriture' ? "L'IA applique votre demande à la page…" : ETAPES[travail.etape]}
        {travail.etape === 'reparation' ? ` (passage ${travail.tentative})` : ''}
      </p>
      <ol className="mt-3 flex gap-2">
        {etapes.map(([k, label], i) => (
          <li key={k} className={`flex-1 rounded-lg border px-2 py-1.5 text-center text-[11px] font-semibold ${i < rang ? 'border-violet-400/40 text-violet-200' : i === rang ? 'border-violet-300 bg-violet-400/15 text-white' : 'border-white/10 text-gray-500'}`}>
            {label}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-gray-500">Vous pouvez quitter cette page : le travail continue, et la version se met en ligne toute seule.</p>
    </section>
  )
}
