import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Link2,
  Layers,
  PenLine,
  Puzzle,
  Download,
  MousePointerClick,
  Sparkles,
  ShieldCheck,
  Store,
  Zap,
  Hand,
  ExternalLink,
  Check,
  X,
  Copy,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { PlatformBadge } from '../components/PlatformBadge'
import { api, assetUrl, apiRoot } from '../lib/api'
import { PLATFORM_GUIDES } from '../lib/platformGuides'
import { INTEGRATION_LABEL, INTEGRATION_STYLE, type PlatformInfo } from '../lib/platforms'

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-purple-500/20 text-sm font-bold text-purple-200">
        {n}
      </span>
      <div className="flex-1 pb-6">
        <h3 className="font-semibold">{title}</h3>
        <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-gray-300">{children}</div>
      </div>
    </div>
  )
}

/** One destination: a button that unfolds its own connection instructions. */
function PlatformCard({
  platform,
  open,
  onToggle,
}: {
  platform: PlatformInfo
  open: boolean
  onToggle: () => void
}) {
  const guide = PLATFORM_GUIDES[platform.id]

  return (
    <div
      className={`rounded-xl border bg-white/5 transition ${open ? 'border-purple-400/60' : 'border-white/10'}`}
      style={open ? { borderColor: platform.color } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <PlatformBadge label={platform.label} color={platform.color} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{platform.label}</span>
          <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] ${INTEGRATION_STYLE[platform.integration]}`}>
            {INTEGRATION_LABEL[platform.integration]}
          </span>
        </span>
        <span className="shrink-0 text-xs text-gray-400">{open ? 'Fermer' : 'Comment connecter ?'}</span>
      </button>

      {open && (
        <div className="border-t border-white/10 px-4 py-4 text-sm leading-relaxed text-gray-300">
          <p>{guide?.summary ?? platform.note}</p>

          {guide && (
            <ol className="mt-3 list-inside list-decimal space-y-1.5 text-gray-400">
              {guide.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}

          {guide?.caution && (
            <p className="mt-3 rounded-lg border border-orange-400/30 bg-orange-500/10 p-2.5 text-xs text-orange-200">
              {guide.caution}
            </p>
          )}

          {platform.warning && platform.warning !== guide?.caution && (
            <p className="mt-2 rounded-lg border border-orange-400/30 bg-orange-500/10 p-2.5 text-xs text-orange-200">
              {platform.warning}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {guide?.docUrl && (
              <a
                href={guide.docUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-purple-300 hover:underline"
              >
                <span>{guide.docLabel ?? 'Ouvrir'}</span> <ExternalLink size={11} />
              </a>
            )}
            {platform.automatable && !platform.unavailable && (
              <Link to="/settings" className="text-purple-300 hover:underline">
                Saisir mes identifiants dans Réglages
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Guide() {
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const [firstShopKey, setFirstShopKey] = useState<string | null>(null)

  useEffect(() => {
    api.listPlatforms().then(setPlatforms)
    // Un compte sans site n'a pas de clé, et c'est un cas normal : le guide le dit
    // plutôt que d'afficher une adresse qui répondrait 404.
    api
      .listShops()
      .then((shops) => setFirstShopKey(shops[0]?.shopKey ?? null))
      .catch(() => setFirstShopKey(null))
  }, [])

  const catalogUrl = `${apiRoot || window.location.origin}/api/public/shops/${firstShopKey ?? 'VOTRE-CLE'}/products`

  const live = platforms.filter((p) => p.integration === 'live')
  const apiReady = platforms.filter((p) => p.integration === 'api-ready')
  const assisted = platforms.filter((p) => p.integration === 'extension')
  const unavailable = platforms.filter((p) => p.integration === 'none')

  const toggle = (id: string) => setOpenId((current) => (current === id ? null : id))

  return (
    <Layout>
      <h1 className="text-2xl font-bold">Mode d'emploi</h1>
      <p className="mt-1 text-sm text-gray-400">
        Acquérir des produits, les préparer, puis les diffuser — une annonce à la fois ou tout un lot.
      </p>

      {/* Sommaire : la page est longue, elle mérite une entrée par section. */}
      <nav className="mt-5 flex flex-wrap gap-2 text-xs">
        {[
          ['#acquisition', '1. Acquérir des produits'],
          ['#extension', "2. L'extension Chrome"],
          ['#boutique', '3. Brancher ma boutique'],
          ['#plateformes', '4. Relier les plateformes'],
          ['#lot', '5. Publier en lot'],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="rounded-full border border-white/10 px-3 py-1.5 text-gray-300 hover:bg-white/5"
          >
            {label}
          </a>
        ))}
      </nav>

      {/* ---------- 1. Acquisition ---------- */}
      <h2 id="acquisition" className="mt-10 text-lg font-bold">
        1. Acquérir des produits
      </h2>
      <p className="mt-1 text-sm text-gray-400">Trois façons de faire entrer un produit dans votre catalogue.</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <Link2 className="text-purple-300" size={22} />
          <h3 className="mt-3 font-bold">Coller une URL</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-300">
            Vous consultez un produit sur un site, vous copiez son adresse et vous la collez dans
            DropShipper IA. L'IA génère l'annonce complète : titre, description, attributs,
            mots-clés et catégorie.
          </p>
          <p className="mt-3 flex items-start gap-2 text-xs text-gray-400">
            <Layers size={14} className="mt-0.5 shrink-0 text-purple-300" />
            <span>
              Le bouton <b className="text-gray-200">Lot</b> accepte jusqu'à{' '}
              <b className="text-gray-200">25 adresses</b> d'un coup, une par ligne : les 25 annonces
              sont générées en une seule fois.
            </span>
          </p>
          <p className="mt-3 rounded-lg border border-orange-400/30 bg-orange-500/10 p-2.5 text-xs text-orange-200">
            Ne fonctionne pas sur Temu, JoyBuy, AliExpress ou Shein : ces sites construisent leur
            fiche produit en JavaScript, une simple adresse ne livre ni prix ni photos. Utilisez
            l'extension pour ces boutiques.
          </p>
        </div>

        <div className="rounded-xl border border-purple-400/40 bg-purple-500/10 p-5">
          <Sparkles className="text-purple-300" size={22} />
          <h3 className="mt-3 font-bold">L'extension Chrome</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-300">
            La méthode la plus complète. Vous consultez un produit, vous cliquez sur le bouton
            DropShipper IA en bas de votre onglet, et le produit arrive dans votre back-office avec
            son <b className="text-gray-200">prix</b>, ses <b className="text-gray-200">photos</b> et
            ses <b className="text-gray-200">variantes</b> — sans copier-coller.
          </p>
          <p className="mt-3 text-xs text-gray-400">Fonctionne sur toutes les boutiques, y compris Temu et JoyBuy.</p>
          <a href="#extension" className="btn-gradient mt-4 inline-block rounded-lg px-4 py-2 text-sm font-semibold">
            Mode d'emploi ↓
          </a>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <PenLine className="text-purple-300" size={22} />
          <h3 className="mt-3 font-bold">Rédiger vous-même</h3>
          <p className="mt-2 text-sm leading-relaxed text-gray-300">
            Vous saisissez directement votre annonce dans DropShipper IA : titre, description,
            photos, prix et variantes. Vous l'enregistrez, puis vous la publiez comme les autres.
          </p>
          <p className="mt-3 text-xs text-gray-400">
            Utile pour un produit que vous possédez déjà, ou pour une annonce entièrement
            personnalisée.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5 text-sm leading-relaxed text-gray-300">
        Quelle que soit la méthode, l'annonce arrive dans <b className="text-gray-200">Mes annonces</b>, où vous
        contrôlez tout : photos et leur ordre, titre, description, arguments de vente, attributs,
        mots-clés, variantes, et le calcul de marge.
      </div>

      {/* ---------- 2. Extension ---------- */}
      <h2 id="extension" className="mt-12 flex items-center gap-2 text-lg font-bold">
        <Puzzle size={20} className="text-purple-300" /> 2. L'extension Chrome
      </h2>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-6">
        <Step n={1} title="Installer l'extension">
          <p>Téléchargez le fichier .zip, puis :</p>
          <ol className="list-inside list-decimal space-y-1 text-gray-400">
            <li>
              <b className="text-gray-200">Décompressez-le vraiment</b> : clic droit sur le .zip ›
              « Extraire tout… » › Extraire
            </li>
            <li>
              Ouvrez <code className="rounded bg-black/30 px-1.5 py-0.5 text-gray-200">chrome://extensions</code>
            </li>
            <li>Activez le « Mode développeur » en haut à droite</li>
            <li>Cliquez « Charger l'extension non empaquetée » et choisissez le dossier extrait</li>
            <li>Épinglez l'icône DropShipper IA dans votre barre d'outils</li>
          </ol>
          {/* The single most common failure on Windows: Explorer browses a .zip as
              if it were a folder, so nothing is ever really extracted. */}
          <p className="rounded-lg border border-orange-400/30 bg-orange-500/10 p-2.5 text-xs text-orange-200">
            <b>Si Chrome répond qu'il ne trouve pas l'extension</b>, c'est que le dossier choisi est
            encore l'intérieur du .zip : Windows en affiche le contenu comme un dossier normal, mais
            rien n'y est réellement extrait. Refaites « Extraire tout… », et choisissez le dossier
            qui contient directement le fichier <code className="rounded bg-black/30 px-1 py-0.5">manifest.json</code>.
            Autre solution qui marche toujours : faites glisser ce dossier directement sur la page
            chrome://extensions.
          </p>
          <a
            href={assetUrl('/api/public/extension.zip')}
            download="dropshipper-ia-extension.zip"
            className="btn-gradient mt-3 inline-flex items-center gap-2 rounded-xl px-6 py-3 font-semibold"
          >
            <Download size={18} /> Télécharger l'extension Chrome
          </a>
        </Step>

        <Step n={2} title="Se connecter">
          <p>
            Cliquez sur l'icône DropShipper IA dans la barre d'outils, puis connectez-vous avec le
            même compte que sur ce site. C'est à faire une seule fois.
          </p>
        </Step>

        <Step n={3} title="Autoriser un site">
          <p>
            Ouvrez la boutique où vous voulez piocher des produits, puis cliquez sur l'icône de
            l'extension. En haut du panneau, <b className="text-gray-200">au-dessus de vos annonces</b>, un encadré
            propose « <b className="text-gray-200">Ajouter le bouton à ce site</b> ».
          </p>
          <p>
            Chrome vous demandera alors l'autorisation pour ce site précis :{' '}
            <b className="text-gray-200">acceptez-la</b>. C'est ce qui permet à l'extension de lire la fiche produit.
          </p>
          <p className="flex items-start gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            L'autorisation est demandée site par site, jamais pour l'ensemble du web. Vous gardez la
            main sur les boutiques où l'extension a le droit de lire quelque chose.
          </p>
        </Step>

        <Step n={4} title="Envoyer un produit">
          <p>
            Sur une fiche produit, un bouton{' '}
            <span className="rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 px-2 py-1 text-xs font-semibold text-white">
              ✨ Ajouter à DropShipper IA
            </span>{' '}
            apparaît <b className="text-gray-200">en bas à droite</b> de votre onglet.
          </p>
          <p>
            Un clic suffit : l'extension lit le prix, les photos et les variantes, crée l'annonce,
            puis <b className="text-gray-200">ouvre directement l'annonce</b> dans DropShipper IA. Il ne vous
            reste qu'à la contrôler et à la publier.
          </p>
          <p className="flex items-start gap-2 text-xs text-gray-400">
            <MousePointerClick size={14} className="mt-0.5 shrink-0 text-purple-300" />
            <span>
              Sous le bouton, « <b className="text-gray-200">Jamais sur ce site</b> » le fait disparaître
              définitivement de cette boutique. Pour le rétablir, rouvrez le panneau de l'extension
              sur ce site.
            </span>
          </p>
        </Step>

        <Step n={5} title="Remplir un formulaire de vente">
          <p>
            L'extension sert aussi à l'autre bout de la chaîne : sur Vinted, Leboncoin, eBay ou
            Facebook Marketplace, elle remplit le formulaire de dépôt avec votre annonce et vos
            photos filigranées. Le détail plateforme par plateforme est en{' '}
            <a href="#plateformes" className="text-purple-300 hover:underline">
              section 4
            </a>
            .
          </p>
        </Step>
      </div>

      {/* ---------- 3. Brancher sa boutique ---------- */}
      <h2 id="boutique" className="mt-12 flex items-center gap-2 text-lg font-bold">
        <Store size={20} className="text-purple-300" /> 3. Brancher ma boutique à DropShipper IA
      </h2>
      <p className="mt-1 text-sm text-gray-400">
        Deux cas : votre site à vous, ou une boutique Shopify.
      </p>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="font-bold">A. Mon propre site — l'API catalogue</h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-300">
          Chaque annonce publiée sur <b className="text-gray-200">Mon site</b> devient disponible sur une adresse
          web qui renvoie vos produits en JSON. Votre site (ou votre développeur) n'a qu'à lire cette
          adresse : pas de clé, pas de mot de passe, lecture seule.
        </p>

        <p className="mt-2 text-sm leading-relaxed text-gray-300">
          {firstShopKey
            ? "Cette étape ne concerne que les vendeurs qui ont leur propre boutique en ligne. Si vous ne vendez que sur des marketplaces, passez à la suite."
            : "Vous n'avez pas encore de site branché, et ce n'est pas un oubli : si vous vendez uniquement sur des marketplaces, cette étape ne vous concerne pas. Le jour où vous voudrez alimenter votre propre boutique, ajoutez-la dans Réglages → Mes sites, et son adresse apparaîtra ici."}
        </p>

        <p className="mt-2 text-sm leading-relaxed text-gray-300">
          Vous pouvez brancher plusieurs sites — une boutique mode et une boutique high-tech, par
          exemple. Chacun a sa propre adresse, listée dans <b className="text-gray-200">Réglages →
          Mes sites</b>, et ne reçoit que les annonces que vous lui destinez au moment de diffuser.
          Ci-dessous, l'adresse de votre site par défaut.
        </p>

        <label className="mt-4 block text-xs text-gray-400">Adresse de votre catalogue</label>
        <div className="mt-1 flex gap-2">
          <input
            readOnly
            value={catalogUrl}
            onFocus={(e) => e.target.select()}
            className="flex-1 rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs outline-none"
          />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(catalogUrl)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
          >
            <Copy size={12} /> {copied ? 'Copié ✓' : 'Copier'}
          </button>
        </div>

        <p className="mt-4 text-sm text-gray-300">Exemple, à donner tel quel à votre développeur :</p>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs text-gray-300">
{`const res = await fetch('${catalogUrl}')
const { shop, products } = await res.json()

// products[] : id, title, description, price, currency, images[],
// variants, bulletPoints[], attributes{}, metaTitle, metaDescription,
// metaKeywords, category, updatedAt
products.forEach((p) => console.log(p.title, p.price, p.currency))`}
        </pre>

        <p className="mt-3 text-xs text-gray-400">
          Une fiche seule s'obtient en ajoutant l'identifiant du produit à la fin de l'adresse. La
          documentation complète est dans le dossier <code className="rounded bg-black/30 px-1.5 py-0.5">docs/</code>{' '}
          du dépôt.
        </p>
        <p className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-500/10 p-2.5 text-xs text-emerald-200">
          Le prix renvoyé est votre <b>prix de vente</b>, jamais le prix fournisseur : votre marge
          n'apparaît nulle part dans le flux public.
        </p>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="font-bold">B. Ma boutique Shopify</h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-300">
          Shopify est la seule marketplace réellement branchée aujourd'hui : DropShipper IA y crée le
          produit, ses photos, sa description et son prix. Le mode d'emploi détaillé est dans la
          fiche Shopify de la section suivante.
        </p>
        <button
          type="button"
          onClick={() => {
            setOpenId('SHOPIFY')
            document.getElementById('plateformes')?.scrollIntoView({ behavior: 'smooth' })
          }}
          className="btn-gradient mt-3 inline-block rounded-lg px-4 py-2 text-sm font-semibold"
        >
          Voir la fiche Shopify ↓
        </button>
      </div>

      {/* ---------- 4. Plateformes ---------- */}
      <h2 id="plateformes" className="mt-12 text-lg font-bold">
        4. Relier DropShipper IA aux plateformes
      </h2>
      <p className="mt-1 text-sm text-gray-400">
        Cliquez sur une plateforme pour dérouler sa procédure de connexion.
      </p>

      <h3 className="mt-6 flex items-center gap-2 text-sm font-bold text-emerald-300">
        <Zap size={16} /> Publication automatique — ça part tout seul
      </h3>
      <p className="mt-1 text-xs text-gray-400">
        Vous cliquez, DropShipper IA publie. Ce sont aussi les seules destinations utilisables en
        publication de masse.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {live.map((p) => (
          <PlatformCard key={p.id} platform={p} open={openId === p.id} onToggle={() => toggle(p.id)} />
        ))}
      </div>

      <h3 className="mt-8 flex items-center gap-2 text-sm font-bold text-blue-300">
        <Zap size={16} /> Marketplaces à API — compte vendeur requis
      </h3>
      <p className="mt-1 text-xs text-gray-400">
        Ces plateformes possèdent une API, mais elles exigent un compte vendeur validé. Tant que vos
        identifiants ne sont pas saisis, la publication est enregistrée « en attente » avec la bonne
        catégorie : rien n'est perdu.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {apiReady.map((p) => (
          <PlatformCard key={p.id} platform={p} open={openId === p.id} onToggle={() => toggle(p.id)} />
        ))}
      </div>

      <h3 className="mt-8 flex items-center gap-2 text-sm font-bold text-orange-300">
        <Hand size={16} /> Publication assistée par l'extension
      </h3>
      <p className="mt-1 text-xs text-gray-400">
        Aucune API publique : l'extension ouvre le formulaire de dépôt et le remplit. C'est vous qui
        validez.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {assisted.map((p) => (
          <PlatformCard key={p.id} platform={p} open={openId === p.id} onToggle={() => toggle(p.id)} />
        ))}
      </div>

      {unavailable.length > 0 && (
        <>
          <h3 className="mt-8 flex items-center gap-2 text-sm font-bold text-red-300">
            <X size={16} /> Pas de publication possible
          </h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {unavailable.map((p) => (
              <PlatformCard key={p.id} platform={p} open={openId === p.id} onToggle={() => toggle(p.id)} />
            ))}
          </div>
        </>
      )}

      {/* ---------- 5. Publication en lot ---------- */}
      <h2 id="lot" className="mt-12 flex items-center gap-2 text-lg font-bold">
        <Layers size={20} className="text-purple-300" /> 5. Publier plusieurs annonces d'un coup
      </h2>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5 text-sm leading-relaxed text-gray-300">
        <p>
          Dans <b className="text-gray-200">Mes annonces</b>, chaque vignette porte une case à cocher en haut à
          gauche — en <b className="text-gray-200">vue grille</b> comme en <b className="text-gray-200">vue liste</b>{' '}
          (le sélecteur est à droite du compteur d'annonces). « Tout sélectionner » coche ce qui est
          affiché à l'écran, filtre et recherche compris.
        </p>
        <p className="mt-2">
          Le bouton <b className="text-gray-200">Publier en lot</b> ouvre alors la liste des destinations, et
          l'envoi se fait annonce par annonce. Le résultat est affiché à la fin : publiées, en
          attente, en échec — avec le motif de chaque échec.
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/5 p-5">
          <h3 className="flex items-center gap-2 font-bold text-emerald-300">
            <Check size={16} /> Fonctionne en lot
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-gray-300">
            {[...live, ...apiReady].map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <PlatformBadge label={p.label} color={p.color} size={20} />
                <span>
                  <span className="block">{p.label}</span>
                  <span className="block text-[11px] text-gray-500">
                    {p.integration === 'live'
                      ? 'publication immédiate'
                      : 'enregistré « en attente » jusqu\'à la connexion du compte vendeur'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-orange-400/25 bg-orange-500/5 p-5">
          <h3 className="flex items-center gap-2 font-bold text-orange-300">
            <X size={16} /> Impossible en lot
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-gray-300">
            {[...assisted, ...unavailable].map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <PlatformBadge label={p.label} color={p.color} size={20} />
                <span>
                  <span className="block">{p.label}</span>
                  <span className="block text-[11px] text-gray-500">
                    {p.integration === 'none'
                      ? 'aucune publication possible'
                      : 'un onglet à la fois, validé par vous'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-400">
            Pour ces plateformes, ouvrez l'annonce et utilisez « Publier cette annonce » : l'extension
            ouvre le formulaire, le remplit, et vous cliquez sur « Publier ».
          </p>
        </div>
      </div>

      <p className="mt-8 text-sm text-gray-400">
        Une question laissée sans réponse ici ?{' '}
        <Link to="/settings" className="text-purple-300 hover:underline">
          Vos réglages
        </Link>{' '}
        regroupent la boutique, le filigrane et les connexions aux plateformes.
      </p>
    </Layout>
  )
}
