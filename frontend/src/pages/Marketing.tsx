import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, ArrowUpRight, Copy, Check, Download, Trash2, RotateCcw, Search } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api, assetUrl } from '../lib/api'
import { AgentBar } from '../components/AgentBar'
import { AdDialog } from '../components/AdDialog'
import { ProductPicker } from '../components/ProductPicker'
import { telechargerImage } from '../components/ImageViewer'
import {
  AppelSuivant,
  Bandeau,
  BarreCompacte,
  Entete,
  Fenetre,
  Filtres,
  NOM_FORMAT,
  PageCreative,
  formatDe,
  nomCourt,
  useImmobile,
} from '../components/creative/Creative'

type State = Awaited<ReturnType<typeof api.visualState>>
type Pub = Awaited<ReturnType<typeof api.visualGallery>>['images'][number]
type Produit = {
  id: string
  title: string
  aiTitle?: string | null
  images?: unknown
  shopId?: string | null
}

const photos = (p: Produit): string[] =>
  Array.isArray(p.images) ? (p.images as unknown[]).filter((i): i is string => typeof i === 'string') : []

/*
 * Les trois univers du brief (audit du 15/10/2026). Chacun devient la scène
 * dictée à l'atelier : décor et lumière seulement — le produit, son prix et
 * ses caractéristiques viennent toujours de l'annonce.
 */
const UNIVERS = [
  {
    id: 'electrique',
    label: 'Tokyo électrique — violet & chrome',
    scene:
      "Studio sombre aux reflets violets et chromés, lumière latérale franche, structure métallique en arrière-plan. Conserver exactement la forme, les proportions, les couleurs et les marquages du produit. Laisser un espace calme pour l'accroche.",
  },
  {
    id: 'beaute',
    label: 'Éditorial beauté — rose & matière',
    scene:
      "Décor rose satiné, reflets doux et ruban sculptural, lumière de studio diffuse. Garder le produit fidèle à sa photo, sans logo inventé ni allégation ajoutée. Zone calme pour le texte.",
  },
  {
    id: 'pop',
    label: 'Pop énergie — vert & mouvement',
    scene:
      "Fond citron vert uni, couleurs franches, produit légèrement incliné comme saisi en mouvement, ombre nette. Conserver la géométrie et les marquages du produit, aucune caractéristique ajoutée.",
  },
] as const

/* Le format du brief, posé sur une destination réelle de l'atelier. */
const FORMATS_BRIEF = [
  { id: 'vertical', label: 'Vertical 9:16', reseau: 'instagram-story', detail: 'Story, Reels, TikTok · 1080×1920' },
  { id: 'carre', label: 'Carré 1:1', reseau: 'instagram', detail: 'Fil Instagram · 1080×1080' },
  { id: 'paysage', label: 'Paysage 1,91:1', reseau: 'facebook', detail: 'Fil Facebook · 1200×628' },
] as const

const FILTRES = [
  { id: 'toutes', label: 'Toutes' },
  { id: 'vertical', label: 'Vertical' },
  { id: 'carre', label: 'Carré' },
  { id: 'paysage', label: 'Paysage' },
] as const

type Diapo = {
  cle: string
  image: string | null
  surtitre: string
  titre: string
  sousTitre: string
  action: { label: string; faire: () => void } | { label: string; to: string }
}

/**
 * Le Studio publicitaire.
 *
 * Refait d'après l'audit du 15/10/2026 : les publicités passent avant les
 * explications. En tête, les créations du vendeur en carrousel et le brief ;
 * puis la galerie filtrable par format, la recherche des produits et l'avis
 * de Laurence. Rien n'est fictif : sans publicité, le carrousel montre les
 * produits qui attendent la leur, et sans produit il le dit.
 *
 * Ce que la page ne fait pas, et le dit : elle n'engage aucun budget. Le
 * ciblage et les enchères restent chez la régie, là où le vendeur voit ce qui
 * part de son compte.
 */
export default function Marketing() {
  const [params, setParams] = useSearchParams()
  const [state, setState] = useState<State | null>(null)
  const [pubs, setPubs] = useState<Pub[] | null>(null)
  const [produits, setProduits] = useState<Produit[] | null>(null)
  const [avis, setAvis] = useState<{ id: string; titre: string } | null>(null)
  const rechargerProduits = useRef<(() => void) | null>(null)
  const [adCible, setAdCible] = useState<{
    id: string
    titre: string
    shopId?: string | null
    scene?: string
    reseau?: string
  } | null>(null)
  const [apercu, setApercu] = useState<Pub | null>(null)
  const [filtre, setFiltre] = useState<(typeof FILTRES)[number]['id']>('toutes')
  const [toutVoir, setToutVoir] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const briefOuvert = params.get('brief') === '1'

  function ouvrirBrief(ouvert: boolean) {
    const suivant = new URLSearchParams(params)
    if (ouvert) suivant.set('brief', '1')
    else suivant.delete('brief')
    setParams(suivant, { replace: true })
  }

  useEffect(() => {
    api.visualState().then(setState).catch(() => setError('Atelier indisponible'))
    api
      .visualGallery('ad')
      .then((r) => setPubs(Array.isArray(r?.images) ? r.images : []))
      .catch(() => setPubs([]))
    api
      .listProducts()
      .then((l) => setProduits(Array.isArray(l) ? (l as Produit[]) : []))
      .catch(() => setProduits([]))
  }, [])

  async function jeter(id: string) {
    if (!window.confirm('Jeter cette publicité ? La refaire coûtera de nouveau des drops.')) return
    await api.deleteImage(id).catch(() => undefined)
    setPubs((v) => (v ?? []).filter((i) => i.id !== id))
    setApercu(null)
  }

  const affichees = useMemo(
    () => (pubs ?? []).filter((p) => filtre === 'toutes' || formatDe(p.width, p.height) === filtre),
    [pubs, filtre],
  )

  const diapos: Diapo[] = useMemo(() => {
    if (pubs && pubs.length) {
      return pubs.slice(0, 5).map((p) => ({
        cle: p.id,
        image: assetUrl(p.path),
        surtitre: [p.platform ?? 'Publicité', `${p.width}×${p.height}`].join(' — '),
        titre: nomCourt(p.productTitle ?? 'Annonce supprimée'),
        sousTitre: `Créée le ${new Date(p.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`,
        action: { label: "Ouvrir l'aperçu", faire: () => setApercu(p) },
      }))
    }
    const avecPhoto = (produits ?? []).filter((p) => photos(p).length > 0).slice(0, 3)
    if (avecPhoto.length) {
      return avecPhoto.map((p) => ({
        cle: p.id,
        image: assetUrl(photos(p)[0]),
        surtitre: 'Prêt pour le studio',
        titre: nomCourt(p.aiTitle || p.title),
        sousTitre: "Ce produit n'a pas encore sa publicité.",
        action: {
          label: 'Créer sa publicité',
          faire: () => setAdCible({ id: p.id, titre: p.aiTitle || p.title, shopId: p.shopId ?? null }),
        },
      }))
    }
    return [
      {
        cle: 'vide',
        image: null,
        surtitre: 'Votre studio',
        titre: 'Votre première création commence ici.',
        sousTitre: 'Importez un produit : il prendra le premier rôle.',
        action: { label: 'Acquérir des produits', to: '/acquisition' },
      },
    ]
  }, [pubs, produits])

  const cout = state?.tarif?.pub

  return (
    <Layout>
      <PageCreative
        barre={
          <BarreCompacte>
            <span>
              {'Solde '}
              <b>{state ? `${state.credits.toLocaleString('fr-FR')} drops` : '…'}</b>
            </span>
            <span>
              {'Une publicité '}
              <b>{cout ? `${cout} drops par format` : '…'}</b>
            </span>
            <span>
              <b>{pubs ? pubs.length : '…'}</b>
              {pubs && pubs.length > 1 ? ' publicités produites' : ' publicité produite'}
            </span>
            <span>
              <b>{produits ? produits.length : '…'}</b>
              {' produits au catalogue'}
            </span>
            <Link to="/credits" className="c-barre-fin font-semibold text-[var(--c-lime)] hover:underline">
              Mes crédits
            </Link>
          </BarreCompacte>
        }
      >
        <Entete
          surtitre="01 / Le studio"
          ligne1="Vos produits."
          ligne2="Le premier rôle."
          chapo="Imaginez, composez, déclinez. Un espace pour créer des publicités à la hauteur de votre marque."
        />

        {state && !state.configured ? (
          <p className="mt-4 text-xs text-amber-300">La génération n'est pas encore configurée sur le serveur.</p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

        <div className="c-heros mt-8">
          <Showreel diapos={diapos} suspendu={Boolean(apercu || adCible || briefOuvert)} />
          <div className="c-carte-brief">
            <p className="c-etiquette">Votre prochaine création</p>
            <span className="c-etoile mt-6" aria-hidden>
              ✳
            </span>
            <p className="mt-6 text-2xl font-extrabold leading-tight">Une idée. Plusieurs possibilités.</p>
            <p className="mt-3 text-sm leading-relaxed">Un produit, un univers, un format. Le studio fait le lien.</p>
            <button type="button" onClick={() => ouvrirBrief(true)} className="c-bouton mt-auto self-start">
              <span>Créer mon brief</span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </div>

        <div className="mt-10">
          <Bandeau mots={['PRODUCT DESIGN', 'SOCIAL CONTENT', 'MOTION ADVERTISING', 'CREATIVE INTELLIGENCE']} />
        </div>

        {/* ---------- La galerie ---------- */}
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="c-h2">Des idées qui prennent vie.</h2>
              <p className="mt-2 text-sm text-[var(--c-texte-2)]">
                Vos publicités, de la plus récente à la plus ancienne. Déjà payées : les revoir et les télécharger ne
                coûte rien.
              </p>
            </div>
            <Filtres options={FILTRES} valeur={filtre} onChange={setFiltre} />
          </div>

          {pubs === null ? (
            <p className="mt-6 text-sm text-[var(--c-texte-2)]">Chargement…</p>
          ) : affichees.length === 0 ? (
            <div className="c-panneau mt-6 p-8 text-center">
              <p className="text-sm text-[var(--c-texte-2)]">
                {pubs.length
                  ? `Aucune publicité au format ${NOM_FORMAT[filtre as keyof typeof NOM_FORMAT].toLowerCase()} pour l'instant.`
                  : 'Aucune publicité produite pour l’instant. Celles que vous ferez créer resteront ici, toutes annonces confondues.'}
              </p>
              <button type="button" onClick={() => ouvrirBrief(true)} className="c-bouton mt-4">
                <span>Créer mon brief</span>
                <ArrowUpRight size={15} />
              </button>
            </div>
          ) : (
            <>
              <ul className="c-galerie mt-6">
                {(toutVoir ? affichees : affichees.slice(0, 9)).map((p) => (
                  <li key={p.id}>
                    <button type="button" className="c-vignette" onClick={() => setApercu(p)}>
                      <img src={assetUrl(p.path)} alt="" loading="lazy" />
                      <span className="c-vignette-voile">
                        <span className="uppercase">
                          {`${NOM_FORMAT[formatDe(p.width, p.height)]} · ${p.width}×${p.height}`}
                        </span>
                        <ArrowUpRight size={16} />
                      </span>
                    </button>
                    <p className="mt-2 truncate text-sm font-bold" title={p.productTitle ?? ''}>
                      {nomCourt(p.productTitle ?? 'Annonce supprimée')}
                    </p>
                    <p className="text-xs text-[var(--c-texte-2)]">
                      {[p.platform, new Date(p.createdAt).toLocaleDateString('fr-FR'), p.kept ? 'utilisée' : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </li>
                ))}
              </ul>
              {affichees.length > 9 ? (
                <button type="button" onClick={() => setToutVoir((v) => !v)} className="c-bouton-sec mt-5">
                  {toutVoir ? 'Réduire' : `Voir les ${affichees.length} publicités`}
                </button>
              ) : null}
            </>
          )}
        </section>

        {/* ---------- Les produits : recherche, avis, génération ---------- */}
        <section className="mt-14">
          <p className="c-etiquette">Recherche et avis</p>
          <h2 className="c-h2 mt-2">Choisissez qui passe à l'écran.</h2>
          <p className="mt-2 max-w-3xl text-sm text-[var(--c-texte-2)]">
            Cherchez une annonce, demandez l'avis de Laurence avant de dépenser, puis générez la publicité. Le coût
            s'affiche avant chaque génération.
          </p>
          <ProductPicker
            ouvert={null}
            onAvis={(p) => setAvis({ id: p.id, titre: p.aiTitle || p.title })}
            onChange={(fn) => (rechargerProduits.current = fn)}
            onGenerer={(p) => {
              setAvis(null)
              setAdCible({ id: p.id, titre: p.aiTitle || p.title, shopId: p.shopId ?? null })
            }}
          />
          {avis ? (
            <AvisLaurence
              produit={avis}
              onFerme={() => setAvis(null)}
              onEcrit={() => rechargerProduits.current?.()}
            />
          ) : null}
        </section>

        <section className="mt-12">
          <AgentBar
            agentKey="marketing"
            nom="Laurence"
            emoji="📣"
            exemple="Demandez a Laurence : quel budget pour un CPA de douze euros ?"
          />
          <p className="mt-3 text-xs text-[var(--c-texte-2)]">
            Nous produisons la publicité, pas la campagne : le budget, le ciblage et les enchères se règlent chez la
            régie, là où vous voyez ce que vous dépensez.
          </p>
        </section>

        <AppelSuivant question="Une création prête à sortir du studio ?" libelle="Préparer la diffusion" to="/reseaux" />

        {briefOuvert ? (
          <Brief
            produits={produits ?? []}
            cout={cout ?? null}
            credits={state?.credits ?? null}
            onClose={() => ouvrirBrief(false)}
            onLancer={(c) => {
              ouvrirBrief(false)
              setAdCible(c)
            }}
          />
        ) : null}

        {apercu ? <Apercu pub={apercu} onClose={() => setApercu(null)} onJeter={() => jeter(apercu.id)} /> : null}

        {adCible ? (
          <AdDialog
            productId={adCible.id}
            productTitle={adCible.titre}
            shopId={adCible.shopId}
            scene={adCible.scene}
            reseau={adCible.reseau}
            credits={state?.credits ?? null}
            coutParPub={state?.tarif?.pub}
            onClose={() => setAdCible(null)}
            onGenerated={(images, credits) => {
              setState((s) => (s ? { ...s, credits } : s))
              // La galerie se remplit tout de suite : la pub existe, elle doit
              // se voir sans recharger.
              api
                .visualGallery('ad')
                .then((r) => setPubs(Array.isArray(r?.images) ? r.images : []))
                .catch(() => undefined)
              void images
            }}
          />
        ) : null}
      </PageCreative>
    </Layout>
  )
}

/** Le carrousel du haut : défile seul toutes les 8 s, sauf pause, survol, focus ou fenêtre ouverte. */
function Showreel({ diapos, suspendu }: { diapos: Diapo[]; suspendu: boolean }) {
  const [i, setI] = useState(0)
  const [survol, setSurvol] = useState(false)
  const immobile = useImmobile()
  const n = diapos.length
  const index = n ? i % n : 0
  const d = diapos[index]

  useEffect(() => {
    if (n < 2 || immobile || survol || suspendu) return
    const t = window.setInterval(() => {
      if (!document.hidden) setI((v) => v + 1)
    }, 8000)
    return () => window.clearInterval(t)
  }, [n, immobile, survol, suspendu])

  if (!d) return null
  const action = d.action
  return (
    <div
      className="c-showreel"
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
      onFocus={() => setSurvol(true)}
      onBlur={() => setSurvol(false)}
      aria-roledescription="carrousel"
    >
      <div key={d.cle} className="c-transition absolute inset-0">
        {d.image ? (
          <>
            <img src={d.image} alt="" className="c-showreel-flou" />
            <img src={d.image} alt="" className="c-showreel-contenue" />
          </>
        ) : (
          <div className="c-scene-vide" />
        )}
      </div>
      <div className="c-showreel-voile" />
      <div key={`t-${d.cle}`} className="c-showreel-texte c-transition">
        <p className="c-etiquette !text-[var(--c-lime)]">{d.surtitre}</p>
        <p className="c-showreel-titre">{d.titre}</p>
        <p className="mt-3 text-sm text-[var(--c-texte-2)]">{d.sousTitre}</p>
        {'to' in action ? (
          <Link to={action.to} className="mt-6 inline-flex items-center gap-1 text-xs font-bold tracking-[0.14em] uppercase">
            {action.label} <ArrowUpRight size={14} />
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.faire}
            className="mt-6 inline-flex items-center gap-1 self-start text-xs font-bold tracking-[0.14em] uppercase"
          >
            {action.label} <ArrowUpRight size={14} />
          </button>
        )}
      </div>
      <div className="c-showreel-bas">
        <span>{`SHOWREEL / ${String(index + 1).padStart(2, '0')} — ${String(n).padStart(2, '0')}`}</span>
        <span className="flex gap-1.5">
          {diapos.map((x, k) => (
            <span key={x.cle} className="c-tiret" aria-current={k === index} />
          ))}
        </span>
        {n > 1 ? (
          <span className="ml-auto flex gap-2">
            <button type="button" className="c-fleche" aria-label="Précédente" onClick={() => setI((v) => v + n - 1)}>
              <ArrowLeft size={14} />
            </button>
            <button type="button" className="c-fleche" aria-label="Suivante" onClick={() => setI((v) => v + 1)}>
              <ArrowRight size={14} />
            </button>
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** Une publicité dans chacun des trois cadres, pour juger du recadrage avant de diffuser. */
function Apercu({ pub, onClose, onJeter }: { pub: Pub; onClose: () => void; onJeter: () => void }) {
  const naturel = formatDe(pub.width, pub.height)
  const [cadre, setCadre] = useState<'16:9' | '1:1' | '9:16'>(
    naturel === 'vertical' ? '9:16' : naturel === 'paysage' ? '16:9' : '1:1',
  )
  const [tour, setTour] = useState(0)
  const url = assetUrl(pub.path)
  const etiquette = ['pub', pub.platform, pub.productTitle].filter(Boolean).join('-')

  return (
    <Fenetre titre={nomCourt(pub.productTitle ?? 'Publicité')} onClose={onClose} large>
      <p className="mt-1 text-xs text-[var(--c-texte-2)]">
        {[pub.platform, `${pub.width}×${pub.height}`, new Date(pub.createdAt).toLocaleDateString('fr-FR')]
          .filter(Boolean)
          .join(' · ')}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Filtres
          options={[
            { id: '16:9', label: '16:9' },
            { id: '1:1', label: '1:1' },
            { id: '9:16', label: '9:16' },
          ]}
          valeur={cadre}
          onChange={setCadre}
        />
        <button type="button" className="c-bouton-sec ml-auto !py-1.5 !text-xs" onClick={() => setTour((t) => t + 1)}>
          <RotateCcw size={13} /> Rejouer
        </button>
      </div>
      <div key={`${cadre}-${tour}`} className="c-cadre c-rejoue mt-4" data-format={cadre}>
        <img src={url} alt="" className="c-cadre-flou" />
        <img src={url} alt="" className="c-cadre-image" />
      </div>
      <p className="mt-3 text-xs text-[var(--c-texte-2)]">
        L'aperçu place votre publicité dans chaque cadre pour juger du recadrage ; il ne publie rien.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/reseaux" className="c-bouton">
          <span>Diffuser</span>
          <ArrowUpRight size={15} />
        </Link>
        <button type="button" className="c-bouton-sec" onClick={() => telechargerImage(url, etiquette)}>
          <Download size={14} /> Télécharger
        </button>
        {pub.productId ? (
          <Link to={`/products/${pub.productId}`} className="c-bouton-sec">
            Voir l'annonce
          </Link>
        ) : null}
        <button type="button" className="c-bouton-sec ml-auto text-red-300" onClick={onJeter}>
          <Trash2 size={14} /> Jeter
        </button>
      </div>
    </Fenetre>
  )
}

/**
 * Le brief : un produit réel, un univers, un format.
 *
 * Il se prépare et se copie sans rien coûter. Le lancer ouvre l'atelier avec
 * la scène et la destination déjà posées ; c'est là que le prix est relu et
 * que la génération part, jamais avant.
 */
function Brief({
  produits,
  cout,
  credits,
  onClose,
  onLancer,
}: {
  produits: Produit[]
  cout: number | null
  credits: number | null
  onClose: () => void
  onLancer: (c: { id: string; titre: string; shopId?: string | null; scene: string; reseau: string }) => void
}) {
  const [recherche, setRecherche] = useState('')
  const [produit, setProduit] = useState<Produit | null>(null)
  const [univers, setUnivers] = useState<(typeof UNIVERS)[number]['id']>(UNIVERS[0].id)
  const [format, setFormat] = useState<(typeof FORMATS_BRIEF)[number]['id']>(FORMATS_BRIEF[0].id)
  const [pret, setPret] = useState(false)
  const [copie, setCopie] = useState(false)

  const trouves = useMemo(() => {
    const t = recherche.trim().toLowerCase()
    return produits.filter((p) => !t || (p.aiTitle || p.title || '').toLowerCase().includes(t)).slice(0, 6)
  }, [produits, recherche])

  const u = UNIVERS.find((x) => x.id === univers) ?? UNIVERS[0]
  const f = FORMATS_BRIEF.find((x) => x.id === format) ?? FORMATS_BRIEF[0]
  const titre = produit ? produit.aiTitle || produit.title : ''
  const texte = [
    `Produit : ${titre}`,
    `Direction : ${u.label}`,
    `Format : ${f.label} (${f.detail})`,
    'Objectif : présenter le produit avec une accroche courte.',
    'Contraintes : respecter le produit réel, vérifier les caractéristiques et valider avant diffusion.',
  ].join('\n')

  const copier = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(texte)
      setCopie(true)
      setTimeout(() => setCopie(false), 1500)
    } catch {
      // Presse-papiers refusé : le texte reste sélectionnable.
    }
  }, [texte])

  return (
    <Fenetre titre="Votre prochain brief." onClose={onClose}>
      <p className="mt-1 text-sm text-[var(--c-texte-2)]">Définissez une direction créative en trois choix.</p>

      {produits.length === 0 ? (
        <div className="c-panneau mt-5 p-4 text-sm text-[var(--c-texte-2)]">
          Aucun produit au catalogue pour l'instant.{' '}
          <Link to="/acquisition" className="font-semibold text-[var(--c-lime)] underline">
            Acquérir des produits
          </Link>
        </div>
      ) : (
        <>
          <label className="mt-5 block">
            <span className="c-etiquette">Produit</span>
            <span className="relative mt-2 block">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-texte-2)]" />
              <input
                value={recherche}
                maxLength={100}
                onChange={(e) => {
                  setRecherche(e.target.value)
                  setPret(false)
                }}
                placeholder="Chercher une annonce : casque, parfum, sac…"
                className="c-champ !pl-9"
              />
            </span>
          </label>
          <ul className="mt-2 space-y-1">
            {trouves.map((p) => {
              const img = photos(p)[0]
              const choisi = produit?.id === p.id
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setProduit(p)
                      setPret(false)
                    }}
                    aria-pressed={choisi}
                    className={`flex w-full items-center gap-3 rounded-lg border px-2 py-1.5 text-left text-sm ${
                      choisi ? 'border-[var(--c-lime)] bg-white/5' : 'border-transparent hover:bg-white/5'
                    }`}
                  >
                    {img ? (
                      <img src={assetUrl(img)} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="h-9 w-9 shrink-0 rounded-md bg-white/10" />
                    )}
                    <span className="min-w-0 flex-1 truncate" title={p.aiTitle || p.title}>
                      {nomCourt(p.aiTitle || p.title, 9)}
                    </span>
                    {choisi ? <Check size={15} className="text-[var(--c-lime)]" /> : null}
                  </button>
                </li>
              )
            })}
            {trouves.length === 0 ? (
              <li className="px-2 py-1.5 text-sm text-[var(--c-texte-2)]">Aucune annonce ne correspond.</li>
            ) : null}
          </ul>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="c-etiquette">Univers</span>
              <select
                value={univers}
                onChange={(e) => {
                  setUnivers(e.target.value as typeof univers)
                  setPret(false)
                }}
                className="c-champ mt-2"
              >
                {UNIVERS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="c-etiquette">Format</span>
              <select
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value as typeof format)
                  setPret(false)
                }}
                className="c-champ mt-2"
              >
                {FORMATS_BRIEF.map((x) => (
                  <option key={x.id} value={x.id}>
                    {`${x.label} — ${x.detail}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {pret && produit ? (
            <>
              <pre className="mt-5 whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs leading-relaxed text-[var(--c-texte)]">
                {texte}
              </pre>
              <p className="mt-3 text-sm text-[var(--c-texte-2)]">
                {cout
                  ? `Générer cette publicité coûtera ${cout} drops${credits !== null ? ` · votre solde : ${credits.toLocaleString('fr-FR')} drops` : ''}. Rien n'est débité avant la validation dans l'atelier.`
                  : 'Le coût s’affiche dans l’atelier avant la génération.'}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="c-bouton"
                  onClick={() =>
                    onLancer({
                      id: produit.id,
                      titre,
                      shopId: produit.shopId ?? null,
                      scene: u.scene,
                      reseau: f.reseau,
                    })
                  }
                >
                  <span>{cout ? `Générer · ${cout} drops` : 'Ouvrir l’atelier'}</span>
                  <ArrowUpRight size={15} />
                </button>
                <button type="button" className="c-bouton-sec" onClick={copier}>
                  {copie ? <Check size={14} /> : <Copy size={14} />} {copie ? 'Copié' : 'Copier le brief'}
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="c-bouton mt-5" disabled={!produit} onClick={() => setPret(true)}>
              <span>Préparer le brief</span>
              <ArrowUpRight size={15} />
            </button>
          )}
          <p className="mt-3 text-xs text-[var(--c-texte-2)]">
            Préparer et copier le brief est gratuit. Seule la génération, validée dans l'atelier, se paie.
          </p>
        </>
      )}
    </Fenetre>
  )
}

/**
 * L'avis de Laurence sur un produit, payé une fois et relu autant qu'on veut.
 *
 * L'avis existant est servi sans rien facturer. « Refaire » est un geste
 * distinct, et il annonce son prix : c'est celui du vendeur qui a changé son
 * prix d'achat et veut un avis sur les nouveaux chiffres.
 */
function AvisLaurence({
  produit,
  onFerme,
  onEcrit,
}: {
  produit: { id: string; titre: string }
  onFerme: () => void
  onEcrit: () => void
}) {
  const [texte, setTexte] = useState<string | null>(null)
  const [quand, setQuand] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  const demander = useCallback(
    async (refaire: boolean) => {
      setBusy(true)
      setErreur(null)
      try {
        const r = await api.adAdvice(produit.id, refaire)
        setTexte(r.avis)
        setQuand(r.at)
        if (r.facture) onEcrit()
      } catch (e) {
        setErreur(e instanceof Error ? e.message : "Laurence n'a pas pu répondre.")
      } finally {
        setBusy(false)
      }
    },
    [produit.id, onEcrit],
  )

  useEffect(() => {
    demander(false)
  }, [demander])

  return (
    <section className="c-panneau mt-4 border-[var(--c-rose)]/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{`Avis de Laurence sur « ${nomCourt(produit.titre, 9)} »`}</p>
        <button type="button" onClick={onFerme} className="text-xs text-[var(--c-texte-2)] hover:text-white">
          Fermer
        </button>
      </div>

      {busy ? <p className="mt-3 text-sm text-[var(--c-texte-2)]">Laurence regarde vos chiffres…</p> : null}
      {erreur ? <p className="mt-3 text-sm text-red-300">{erreur}</p> : null}

      {texte ? (
        <>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{texte}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {quand ? (
              <span className="text-[11px] text-[var(--c-texte-2)]">
                {`Rendu le ${new Date(quand).toLocaleDateString('fr-FR')} — relisez-le autant que vous voulez.`}
              </span>
            ) : null}
            {/* Le prix est annoncé avant le clic, jamais découvert après. */}
            <button
              type="button"
              onClick={() => demander(true)}
              disabled={busy}
              className="c-bouton-sec ml-auto !py-1.5 !text-xs disabled:opacity-50"
            >
              Refaire l'avis (10 drops)
            </button>
          </div>
        </>
      ) : null}
    </section>
  )
}
