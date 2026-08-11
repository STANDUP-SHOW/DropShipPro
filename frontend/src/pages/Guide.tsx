import { Link } from 'react-router-dom'
import { Link2, Layers, PenLine, Puzzle, Download, MousePointerClick, Sparkles, ShieldCheck } from 'lucide-react'
import { Layout } from '../components/Layout'
import { assetUrl } from '../lib/api'

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

export default function Guide() {
  return (
    <Layout>
      <h1 className="text-2xl font-bold">Comment ça marche</h1>
      <p className="mt-1 text-sm text-gray-400">
        Trois façons de créer une annonce, puis une diffusion vers vos marketplaces.
      </p>

      {/* ---------- Les 3 méthodes ---------- */}
      <h2 className="mt-9 text-lg font-bold">1. Créer une annonce</h2>

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
            Le bouton <b className="text-gray-200">Lot</b> accepte jusqu'à <b className="text-gray-200">25 adresses</b>{' '}
            d'un coup, une par ligne : les 25 annonces sont générées en une seule fois.
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

      {/* ---------- Diffusion ---------- */}
      <h2 className="mt-10 text-lg font-bold">2. Contrôler, puis diffuser</h2>
      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-5 text-sm leading-relaxed text-gray-300">
        Quelle que soit la méthode, l'annonce arrive dans <b className="text-gray-200">Mes annonces</b>, où vous
        contrôlez tout : photos et leur ordre, titre, description, arguments de vente, attributs,
        mots-clés, variantes, et le calcul de marge. Puis le bouton{' '}
        <b className="text-gray-200">Publier cette annonce</b> ouvre la liste des marketplaces :
        vous cochez celles que vous voulez et vous validez avec{' '}
        <b className="text-gray-200">Diffuser votre annonce</b>.
      </div>

      {/* ---------- Manuel extension ---------- */}
      <h2 id="extension" className="mt-12 flex items-center gap-2 text-lg font-bold">
        <Puzzle size={20} className="text-purple-300" /> Mode d'emploi de l'extension
      </h2>

      <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-6">
        <Step n={1} title="Installer l'extension">
          <p>Téléchargez l'extension, décompressez le dossier, puis dans Chrome :</p>
          <ol className="list-inside list-decimal space-y-1 text-gray-400">
            <li>
              Ouvrez <code className="rounded bg-black/30 px-1.5 py-0.5 text-gray-200">chrome://extensions</code>
            </li>
            <li>Activez le « Mode développeur » en haut à droite</li>
            <li>Cliquez « Charger l'extension non empaquetée » et choisissez le dossier décompressé</li>
            <li>Épinglez l'icône DropShipper IA dans votre barre d'outils</li>
          </ol>
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
            Sous le bouton, « <b className="text-gray-200">Jamais sur ce site</b> » le fait disparaître
            définitivement de cette boutique. Pour le rétablir, rouvrez le panneau de l'extension sur
            ce site.
          </p>
        </Step>
      </div>

      <p className="mt-8 text-sm text-gray-400">
        Une question laissée sans réponse ici ?{' '}
        <Link to="/settings" className="text-purple-300 hover:underline">
          Vos réglages
        </Link>{' '}
        regroupent la boutique, le filigrane et les connexions aux marketplaces.
      </p>
    </Layout>
  )
}
