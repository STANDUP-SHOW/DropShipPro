import { Puzzle, Download, MousePointerClick, ListPlus, ClipboardCheck, ShieldAlert, Images, RefreshCw } from 'lucide-react'
import { Layout } from '../components/Layout'
import { apiRoot } from '../lib/api'

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
  return (
    <Layout>
      <div className="flex items-center gap-2.5">
        <Puzzle size={22} className="text-purple-300" />
        <h1 className="text-xl font-extrabold tracking-wide">EXTENSION CHROME</h1>
      </div>
      <p className="mt-0.5 mb-5 text-xs text-gray-500">
        Elle lit les fiches dans votre navigateur, importe à l'unité ou par lots, et remplit les formulaires de vente à votre place.
      </p>

      {/* ---------- Installation ---------- */}
      <section
        className="rounded-2xl border border-purple-400/25 bg-purple-500/[0.08] p-4 backdrop-blur-xl"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}
      >
        <h2 className="text-sm font-bold">Installer l'extension</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-gray-400">
          <li>Téléchargez l'archive ci-dessous et décompressez-la dans un dossier que vous gardez.</li>
          <li>
            Ouvrez <code className="rounded bg-black/30 px-1">chrome://extensions</code>, activez le « Mode développeur » en haut à droite.
          </li>
          <li>« Charger l'extension non empaquetée », puis désignez le dossier décompressé.</li>
          <li>Cliquez l'icône de l'extension et connectez-vous avec votre compte DropShipper IA.</li>
        </ol>
        <a
          href={`${apiRoot}/api/public/extension.zip`}
          className="btn-gradient mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
        >
          <Download size={15} />
          <span>Télécharger l'extension (.zip)</span>
        </a>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-gray-500">
          <RefreshCw size={12} className="mt-0.5 shrink-0" />
          <span>
            En mode développeur, l'extension ne se met pas à jour toute seule : quand une nouvelle version est annoncée
            dans l'application, retéléchargez l'archive et rechargez le dossier.
          </span>
        </p>
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
