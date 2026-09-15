import { Puzzle, MousePointerClick, ListPlus, ClipboardCheck, ShieldAlert, Images, Star } from 'lucide-react'
import { Layout } from '../components/Layout'
import { CHROME_STORE_URL } from '../lib/extension'
import { useExtensionVersion } from '../lib/extensionVersion'

/**
 * La page de l'extension Chrome — téléchargement et mode d'emploi complet.
 *
 * **Voulue le 04/09/2026** : « créer nouvelle page avec extension à
 * télécharger et explications du fonctionnement, mode d'emploi mis à jour
 * avec volet pour les lots ». Jusqu'ici l'installation vivait en bas de
 * « Comment acquérir » et le volet des lots n'était documenté nulle part :
 * le vendeur découvrait la moitié des capacités par accident.
 */

const CARTES = [
  {
    icone: MousePointerClick,
    titre: "Importer une fiche, à l'unité",
    texte:
      "Sur chaque fiche produit, l'extension pose un bouton « Importer dans DropShipper IA ». Elle lit la page pendant qu'elle est affichée — prix, variantes, caractéristiques, galerie — puis l'IA réécrit l'annonce et les photos sont filigranées. C'est la seule voie qui marche sur Temu, AliExpress, Shein et JoyBuy : ces sites construisent leurs fiches en JavaScript, un serveur n'en reçoit qu'une coquille vide.",
  },
  {
    icone: Images,
    titre: 'Choisir les photos',
    texte:
      "Avant l'envoi, l'extension montre toutes les images trouvées sur la page — jusqu'à quinze retenues. Les mieux classées sont précochées : ce que la page déclare elle-même passe en premier, et les vignettes de produits voisins ou de panier sont écartées d'office. Les écartées restent dans une bande dépliable, un clic les récupère.",
  },
  {
    icone: ListPlus,
    titre: 'Le volet des lots — jusqu’à vingt-cinq produits',
    texte:
      "Le panneau latéral s'ouvre depuis le bouton de l'extension et reste affiché pendant que vous naviguez de fiche en fiche. Sur chacune : « Ajouter ce produit » — la fiche est relevée à ce moment-là, pendant qu'elle est sous vos yeux, jamais après coup ni de mémoire. Quand la liste vous convient (vingt-cinq au plus), un seul clic importe tout. Sur AliExpress, c'est la seule façon de faire un lot : les prix n'existent que dans le navigateur.",
  },
  {
    icone: ClipboardCheck,
    titre: 'Remplir les formulaires de vente',
    texte:
      "Sur Vinted, Leboncoin, Facebook Marketplace et eBay, l'extension remplit le formulaire de dépôt avec votre annonce — titre à la bonne longueur, description, prix, photos. Elle ne clique jamais « Publier » : vous relisez, vous validez. C'est votre annonce et votre compte.",
  },
  {
    icone: ShieldAlert,
    titre: 'Vos comptes restent à vous',
    texte:
      "L'extension ne rejoue jamais vos mots de passe sur les marketplaces : elle détecte que vous êtes connecté et attend que vous le soyez. Rejouer des identifiants viole les conditions de ces sites et fait suspendre des comptes vendeurs — c'est un choix de conception, pas une limite technique.",
  },
]

export default function Extension() {
  // Le détail « en retard » ne vit plus en haut de toutes les pages : ici, et au
  // survol du bloc Extension, uniquement.
  const { copieDev, installee } = useExtensionVersion()

  return (
    <Layout>
      <div className="flex items-center gap-2.5">
        <Puzzle size={22} className="text-purple-300" />
        <h1 className="text-xl font-extrabold tracking-wide">EXTENSION CHROME</h1>
      </div>
      <p className="mt-0.5 mb-5 text-xs text-gray-500">
        Elle lit les fiches dans votre navigateur, importe à l'unité ou par lots, et remplit les formulaires de vente à votre place.
      </p>

      {/* Le seul avertissement qui reste : une copie chargée à la main ne se met
          jamais à jour. Le site ne compare plus les numéros de version — le store
          ne lit pas notre dépôt, il n'a que ce qu'on lui téléverse. */}
      {copieDev ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
          <span className="text-lg">⚠️</span>
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-amber-100">
            <strong>{`Une copie de l'extension chargée à la main est installée${installee ? ` (${installee})` : ''} : elle ne se mettra jamais à jour.`}</strong>{' '}
            Ouvrez <code className="rounded bg-black/30 px-1">chrome://extensions</code>, retirez-la, puis
            installez l'extension depuis le Chrome Web Store — c'est elle que Chrome tient à jour.
          </p>
        </div>
      ) : null}

      {/* ---------- Installation ---------- */}
      <section
        className="rounded-2xl border border-purple-400/25 bg-purple-500/[0.08] p-4 backdrop-blur-xl"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}
      >
        <h2 className="text-sm font-bold">Installer l'extension</h2>

        {CHROME_STORE_URL ? (
          <>
            {/* Voie principale : le Chrome Web Store — un clic, mises à jour automatiques. */}
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              Un clic depuis le Chrome Web Store. L'extension se met à jour toute seule, et vous vous
              connectez ensuite avec votre compte DropShipper IA.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={CHROME_STORE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="btn-gradient inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
              >
                <Puzzle size={15} />
                <span>Installer depuis le Chrome Web Store</span>
              </a>
              {/* Les avis font monter le classement du store : on le demande, poliment. */}
              <a
                href={CHROME_STORE_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-white/5"
              >
                <Star size={15} />
                <span>Noter l'extension</span>
              </a>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              Un avis ⭐ nous aide énormément à être trouvés par d'autres vendeurs — merci d'avance.
            </p>
            {/* Plus d'installation manuelle (« mode développeur ») : retirée le
                15/09/2026. Une copie chargée à la main ne se met jamais à jour,
                et le store est la seule voie que l'on tient. */}
          </>
        ) : null}
      </section>

      {/* ---------- Mode d'emploi ---------- */}
      <h2 className="mt-6 mb-3 text-sm font-bold uppercase tracking-widest text-gray-400">Ce qu'elle sait faire</h2>
      <div className="space-y-3">
        {CARTES.map((c) => (
          <section
            key={c.titre}
            className="rounded-2xl border border-white/[0.10] bg-white/[0.04] p-4 backdrop-blur-xl"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-start gap-3">
              <c.icone size={18} className="mt-0.5 shrink-0 text-purple-300" />
              <div className="min-w-0">
                <h3 className="text-sm font-bold">{c.titre}</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">{c.texte}</p>
              </div>
            </div>
          </section>
        ))}
      </div>
    </Layout>
  )
}
