import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Sparkles, Store, ArrowRight, Monitor, Smartphone, ExternalLink, History, RotateCcw,
  CreditCard, Wand2, CheckCircle2, AlertTriangle, Loader2, ChevronDown, Trash2, Copy, Image as ImageIcon,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { VitrineBlock } from '../components/VitrineBlock'
import { api, type EtatDropShop, type GammeDropShop, type TravailDropShop } from '../lib/api'

type Boutique = Awaited<ReturnType<typeof api.listShops>>[number]

/**
 * DropShop IA — le studio (17/09/2026).
 *
 * Refonte demandée par Max après de très mauvais retours sur la vitrine à
 * thèmes : « un Lovable-like ». Le vendeur décrit la boutique de ses rêves ;
 * l'IA l'écrit, la teste, la corrige ; il la voit ici, dans l'aperçu, et la
 * modifie par simples demandes. 200 drops la création, 10 modifications
 * comprises, puis 10 drops la demande.
 *
 * Deux colonnes : à gauche la conversation (brief, avancement, demandes,
 * versions, Stripe) ; à droite l'aperçu réel de la boutique — c'est la vraie
 * page servie à /b/<slug>, pas une maquette — en largeur ordinateur ou
 * téléphone. Le travail dure des minutes : la page relit l'état toutes les
 * trois secondes tant qu'il tourne, et survit à un rechargement puisque
 * l'état vit côté serveur.
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
      <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 text-sm font-black text-white shadow-[0_0_14px_rgba(52,211,153,0.5)]">
          IA
        </span>
        <span className="bg-gradient-to-r from-emerald-400 via-green-200 to-white bg-clip-text text-transparent">
          DropShop IA — votre boutique, écrite par l'IA
        </span>
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-gray-400">
        Décrivez la boutique de vos rêves : l'IA la dessine et l'écrit entièrement — design unique, responsive,
        panier, commande, emails, paiement Stripe pré-branché — puis la teste comme un visiteur et corrige ce qui
        manque. Elle est en ligne à sa propre adresse, remplie par votre catalogue, gérée d'ici. <b className="text-gray-200">200 drops</b>{' '}
        la création, <b className="text-gray-200">10 modifications comprises</b>, puis 10 drops la demande.
      </p>

      {/* ---------- Choisir ou nommer la boutique ---------- */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur">
        <h2 className="flex items-center gap-2 font-bold">
          <Store size={16} className="text-emerald-300" />
          <span>Votre boutique</span>
        </h2>
        {hebergees.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {hebergees.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setChoisie(b.id)}
                className={
                  active?.id === b.id
                    ? 'rounded-full bg-emerald-400/20 px-3 py-1.5 text-xs font-semibold text-emerald-200'
                    : 'rounded-full border border-white/10 px-3 py-1.5 text-xs text-gray-400 hover:bg-white/5'
                }
              >
                {b.name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && creer()}
            placeholder={hebergees.length ? 'Ou une nouvelle : Maison Lumea, TechNomade…' : 'Le nom de votre boutique : Maison Lumea, TechNomade…'}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none transition focus:border-emerald-400/70"
          />
          <button
            type="button"
            onClick={creer}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 px-4 py-2.5 text-sm font-bold text-emerald-200 transition hover:bg-emerald-400/10 disabled:opacity-40"
          >
            <Store size={15} />
            <span>{busy ? 'Création…' : 'Nommer la boutique'}</span>
          </button>
        </div>
        {erreur ? <p className="mt-2 text-xs text-red-400">{erreur}</p> : null}
      </section>

      {active ? <Studio boutique={active} onChange={charger} /> : (
        <p className="mt-6 text-xs text-gray-500">
          Nommez ou choisissez une boutique : le studio — brief, aperçu, modifications — s'ouvre juste ici.
        </p>
      )}

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
  termine: 'Terminé.',
  echec: 'Échec.',
}

function Studio({ boutique, onChange }: { boutique: Boutique; onChange: () => void }) {
  const [etat, setEtat] = useState<EtatDropShop | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [brief, setBrief] = useState('')
  const [demande, setDemande] = useState('')
  const [busy, setBusy] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [voirVersions, setVoirVersions] = useState(false)
  const [voirClassique, setVoirClassique] = useState(false)
  const [cle, setCle] = useState('')
  const [copie, setCopie] = useState(false)
  const [rechargement, setRechargement] = useState(0)
  const versionVue = useRef<number>(-1)
  // Le logo, ses couleurs, la gamme choisie, l'expérience immersive.
  const [logos, setLogos] = useState<{ entete: string | null; accueil: string | null }>({ entete: boutique.vitrineLogoEntete, accueil: boutique.vitrineLogoAccueil })
  const [gammes, setGammes] = useState<{ logo: boolean; couleurs: Array<{ hex: string; part: number }>; gammes: GammeDropShop[] } | null>(null)
  const [gammeChoisie, setGammeChoisie] = useState<string | null>(null)
  const [modesVisiteur, setModesVisiteur] = useState(false)
  const [chargeLogo, setChargeLogo] = useState<'entete' | 'accueil' | null>(null)

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

  const enCours = Boolean(etat?.travail && !etat.travail.fin)
  useEffect(() => {
    if (!enCours) return
    const t = setInterval(() => void relire(), 3000)
    return () => clearInterval(t)
  }, [enCours, relire])

  async function lancerCreation() {
    if (!etat) return
    setBusy(true)
    setErreur(null)
    try {
      const gamme = gammes?.gammes.find((g) => g.id === gammeChoisie) ?? null
      await api.dropshopCreer(boutique.id, { description: brief, gamme: gamme ? { nom: gamme.nom, mode: gamme.mode, jetons: gamme.jetons } : null, modesVisiteur })
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

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
      {/* ---------- Colonne gauche : la conversation ---------- */}
      <div className="space-y-4">
        {!etat.creee && !enCours ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
            <h2 className="flex items-center gap-2 font-bold">
              <ImageIcon size={16} className="text-emerald-300" />
              <span>1. Votre logo</span>
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              Déposez-le avant de créer : il prend place dans la barre du haut (petit) et en grand au-dessus du titre
              d'accueil, et l'IA lit ses couleurs pour vous proposer une gamme. PNG, SVG, WebP ou JPEG, fond transparent de préférence.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(['entete', 'accueil'] as const).map((emplacement) => (
                <div key={emplacement} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{emplacement === 'entete' ? 'Barre du haut' : 'Grand, sur l\'accueil'}</p>
                  <div className="mt-2 flex h-20 items-center justify-center rounded-lg bg-white/[0.06]">
                    {logos[emplacement] ? <img src={logos[emplacement] ?? ''} alt="" className="max-h-16 max-w-[90%] object-contain" /> : <span className="text-xs text-gray-500">Aucun logo</span>}
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

            {gammes?.logo ? (
              <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.05] p-3">
                <p className="text-sm font-semibold text-emerald-100">Adapter la boutique aux couleurs de votre logo ?</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                  <span>Couleurs lues :</span>
                  {gammes.couleurs.map((c) => (
                    <span key={c.hex} className="inline-flex items-center gap-1 rounded-full border border-white/10 px-1.5 py-0.5">
                      <span className="inline-block h-3 w-3 rounded-full" style={{ background: c.hex }} />
                      <span className="text-[11px] text-gray-300">{c.hex} · {Math.round(c.part * 100)} %</span>
                    </span>
                  ))}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {gammes.gammes.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGammeChoisie(gammeChoisie === g.id ? null : (g.id ?? null))}
                      className={`rounded-xl border p-2.5 text-left transition ${gammeChoisie === g.id ? 'border-emerald-300 bg-emerald-400/10' : 'border-white/10 hover:bg-white/5'}`}
                    >
                      <span className="flex items-center gap-1.5">
                        {(['fond', 'surface', 'accent', 'accent2', 'texte'] as const).map((k) => (
                          <span key={k} className="inline-block h-5 w-5 rounded-md border border-white/10" style={{ background: g.jetons[k] }} title={k} />
                        ))}
                        <span className="ml-auto text-sm font-bold text-gray-100">{g.nom}</span>
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-gray-400">{g.description}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-gray-500">{gammeChoisie ? 'Cette gamme sera imposée comme palette de départ.' : 'Aucune gamme choisie : l\'IA compose librement, en connaissant les couleurs de votre logo.'}</p>
              </div>
            ) : null}
          </section>
        ) : null}

        {!etat.creee && !enCours ? (
          <section className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-5">
            <h2 className="flex items-center gap-2 font-bold">
              <Wand2 size={16} className="text-emerald-300" />
              <span>{`2. Décrivez la boutique de vos rêves pour ${boutique.name}`}</span>
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              Ce que vous vendez, à qui, l'ambiance, les couleurs, ce qui vous inspire. Plus c'est précis, plus la
              boutique vous ressemble. Elle sera remplie par les {boutique.products} annonce(s) rangée(s) dans cette boutique.
            </p>
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={7}
              placeholder="Ex. Une boutique de montres et bijoux en acier pour hommes, ambiance atelier d'horloger : bois sombre, laiton, noir profond, typographie élégante. Clientèle 25-45 ans, urbaine. Je veux un grand héros avec une montre en gros plan, les catégories en cartes, et un ton sobre, sûr de lui, sans superlatifs."
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm leading-relaxed outline-none transition focus:border-emerald-400/70"
            />
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <input type="checkbox" checked={modesVisiteur} onChange={(e) => setModesVisiteur(e.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-400" />
              <span className="text-xs leading-relaxed text-gray-300">
                <b className="text-gray-100">Expérience client immersive.</b> Vos visiteurs choisissent l'ambiance de la boutique
                depuis un sélecteur dans l'en-tête : quatre assemblages de couleurs complets et soignés, dessinés pour votre
                commerce, chacun avec son bouton. Leur choix est mémorisé.
              </span>
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-gray-400">
                <b className="text-emerald-200">{etat.tarifs.creation} drops</b> · {etat.tarifs.incluses} modifications comprises · en ligne en 3 à 5 minutes
              </span>
              <button
                type="button"
                onClick={lancerCreation}
                disabled={busy || brief.trim().length < 20}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_14px_rgba(52,211,153,0.35)] transition hover:brightness-110 disabled:opacity-40"
              >
                <Sparkles size={15} />
                <span>{busy ? 'Lancement…' : 'Créer ma boutique'}</span>
              </button>
            </div>
            {etat.versions.length > 0 && (
              <p className="mt-3 text-xs text-gray-500">
                Cette boutique a déjà {etat.versions.length} version(s) IA :{' '}
                <button type="button" className="text-purple-300 underline" onClick={() => restaurer(etat.versions[0].numero)}>
                  remettre la dernière
                </button>{' '}
                sans rien payer.
              </p>
            )}
          </section>
        ) : null}

        {travail ? <Avancement travail={travail} /> : null}

        {etat.creee && !enCours ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-5">
            <h2 className="flex items-center gap-2 font-bold">
              <Wand2 size={16} className="text-emerald-300" />
              <span>Demandez une modification</span>
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              « Rends l'en-tête plus sombre », « ajoute une section sur la livraison », « mets les nouveautés avant les
              catégories », « change la police des titres »… L'IA applique, teste, et la version est en ligne.
            </p>
            <textarea
              value={demande}
              onChange={(e) => setDemande(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) lancerModification() }}
              rows={3}
              placeholder="Ce que vous voulez changer…"
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm leading-relaxed outline-none transition focus:border-emerald-400/70"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-gray-400">
                {etat.modifsRestantes > 0
                  ? <><b className="text-emerald-200">{etat.modifsRestantes}</b> modification(s) comprise(s) restante(s)</>
                  : <><b className="text-emerald-200">{etat.tarifs.modification} drops</b> la modification</>}
              </span>
              <button
                type="button"
                onClick={lancerModification}
                disabled={busy || demande.trim().length < 3}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                <Sparkles size={15} />
                <span>Appliquer</span>
              </button>
            </div>
          </section>
        ) : null}

        {erreur ? <p className="text-xs text-red-400">{erreur}</p> : null}

        {etat.versions.length > 0 ? (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <button type="button" onClick={() => setVoirVersions((v) => !v)} className="flex w-full items-center gap-2 text-left text-sm font-bold">
              <History size={15} className="text-purple-300" />
              <span>{`${etat.versions.length} version(s) — la ${etat.version} est en ligne`}</span>
              <ChevronDown size={14} className={`ml-auto transition ${voirVersions ? 'rotate-180' : ''}`} />
            </button>
            {voirVersions ? (
              <ol className="mt-3 space-y-2">
                {etat.versions.map((v) => (
                  <li key={v.numero} className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2 text-xs">
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 font-bold ${v.numero === etat.version ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-gray-300'}`}>v{v.numero}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-gray-200">{v.demande}</span>
                      <span className="text-gray-500">{new Date(v.createdAt).toLocaleString('fr-FR')} · {v.modele}</span>
                    </span>
                    {v.numero !== etat.version && etat.creee ? (
                      <button type="button" onClick={() => restaurer(v.numero)} disabled={busy || enCours} title="Remettre cette version en ligne" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-gray-300 hover:bg-white/5 disabled:opacity-40">
                        <RotateCcw size={12} />
                        <span>Rétablir</span>
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        ) : null}

        {/* ---------- Stripe ---------- */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <CreditCard size={15} className="text-sky-300" />
            <span>Paiement en ligne</span>
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${etat.stripe ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-gray-400'}`}>
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

      {/* ---------- Colonne droite : l'aperçu ---------- */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 rounded-t-2xl border border-b-0 border-white/10 bg-white/[0.05] px-3 py-2">
          <div className="flex gap-1 rounded-lg border border-white/10 p-0.5">
            <button type="button" onClick={() => setMobile(false)} title="Ordinateur" className={`rounded-md p-1.5 ${!mobile ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'}`}><Monitor size={15} /></button>
            <button type="button" onClick={() => setMobile(true)} title="Téléphone" className={`rounded-md p-1.5 ${mobile ? 'bg-white/15 text-white' : 'text-gray-400 hover:text-white'}`}><Smartphone size={15} /></button>
          </div>
          {etat.adresse ? (
            <code className="min-w-0 flex-1 truncate rounded-md bg-black/30 px-2 py-1 text-[11px] text-gray-300">{etat.adresse}</code>
          ) : <span className="text-xs text-gray-500">Adresse posée à la création</span>}
          {etat.creee ? <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-bold text-emerald-200">v{etat.version}</span> : null}
          <button type="button" onClick={copierAdresse} disabled={!etat.adresse} title="Copier l'adresse" className="rounded-md p-1.5 text-gray-400 hover:text-white disabled:opacity-40"><Copy size={15} /></button>
          {copie ? <span className="text-[11px] text-emerald-300">Copiée</span> : null}
          <a href={apercu ?? '#'} target="_blank" rel="noreferrer noopener" className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs ${apercu ? 'text-purple-200 hover:bg-white/10' : 'pointer-events-none text-gray-600'}`}>
            <ExternalLink size={13} />
            <span>Ouvrir</span>
          </a>
        </div>
        <div className={`flex justify-center overflow-hidden rounded-b-2xl border border-white/10 bg-[#0b0b10] ${mobile ? 'py-4' : ''}`} style={{ height: '78vh', minHeight: 560 }}>
          {apercu && (etat.creee || etat.versions.length === 0) ? (
            <iframe
              key={apercu}
              title={`Aperçu de ${boutique.name}`}
              src={apercu}
              className={`h-full bg-white ${mobile ? 'w-[390px] rounded-[28px] border-8 border-black/80 shadow-2xl' : 'w-full'}`}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
              <Sparkles size={28} className="text-emerald-300" />
              <p className="max-w-md text-sm text-gray-300">
                L'aperçu de votre boutique apparaîtra ici — la vraie page, à sa vraie adresse, en largeur ordinateur ou téléphone.
              </p>
              <ul className="max-w-md text-left text-xs leading-relaxed text-gray-500">
                <li>· Accueil avec héros, catégories, nouveautés, réassurances</li>
                <li>· Boutique avec recherche, pages catégorie, fiches produit complètes</li>
                <li>· Panier, commande, paiement Stripe, emails à vos clients et à vous</li>
                <li>· Remplie en direct par vos annonces publiées sur « Mon site »</li>
              </ul>
            </div>
          )}
        </div>
        {etat.creee && boutique.products === 0 ? (
          <p className="mt-2 text-xs text-amber-300/90">
            Aucune annonce n'est rangée dans cette boutique : la page est belle mais vide. Importez ou rangez des annonces dedans, puis publiez-les sur « Mon site ».
          </p>
        ) : null}
      </div>
    </div>
  )
}

function Avancement({ travail }: { travail: TravailDropShop }) {
  const [, tick] = useState(0)
  const enCours = !travail.fin
  // L'horloge du navigateur n'est pas celle du serveur : un décalage d'une
  // minute affichait « 0 s » pendant toute l'écriture. Le compteur part donc
  // du moment où CET écran a vu le travail, et ne recule jamais.
  const vuA = useRef(Date.now())
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
      <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.07] p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-200"><CheckCircle2 size={15} /><span>{titre} : en ligne</span></h3>
        <p className="mt-1 text-xs text-gray-300">{travail.resume ?? 'Terminé.'} <span className="text-gray-500">({secondes} s)</span></p>
      </section>
    )
  }
  const etapes: Array<[string, string]> = [['ecriture', 'Écriture'], ['verification', 'Test du parcours'], ['reparation', 'Corrections']]
  const rang = etapes.findIndex(([k]) => k === travail.etape)
  return (
    <section className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.07] p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-200">
        <Loader2 size={15} className="animate-spin" />
        <span>{titre} en cours — {secondes} s</span>
      </h3>
      <p className="mt-1 text-xs text-gray-300">
        {travail.type === 'modification' && travail.etape === 'ecriture' ? "L'IA applique votre demande à la page…" : ETAPES[travail.etape]}
        {travail.etape === 'reparation' ? ` (passage ${travail.tentative})` : ''}
      </p>
      <ol className="mt-3 flex gap-2">
        {etapes.map(([k, label], i) => (
          <li key={k} className={`flex-1 rounded-lg border px-2 py-1.5 text-center text-[11px] font-semibold ${i < rang ? 'border-emerald-400/40 text-emerald-200' : i === rang ? 'border-emerald-300 bg-emerald-400/15 text-white' : 'border-white/10 text-gray-500'}`}>
            {label}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-gray-500">Vous pouvez quitter cette page : le travail continue, et la version se met en ligne toute seule.</p>
    </section>
  )
}
