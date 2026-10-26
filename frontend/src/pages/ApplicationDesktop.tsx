import { AppWindow, ClipboardList, Download, Layers, Monitor, Send, ShieldAlert, Share2 } from 'lucide-react'
import { Layout } from '../components/Layout'

/**
 * La page de l'application DropShipper Desktop (demande de Max du 13/10/2026 :
 * « l'ajouter dans le menu du catalogue et expliquer à quoi elle sert, ce
 * qu'elle facilite, pour l'importation en lot notamment »).
 *
 * Chaque phrase décrit ce que le code de desktop/ fait (README, lib/circuit.js,
 * renderer/index.html) — pas plus. Ce qui n'a jamais tourné sur un vrai compte
 * de marketplace est dit comme tel.
 *
 * L'installeur est celui de la pré-version « desktop-dernier », réécrite par
 * le workflow desktop-windows.yml : le lien ne change jamais de nom.
 */

export const LIEN_DESKTOP = 'https://github.com/STANDUP-SHOW/DropShipPro/releases/download/desktop-dernier/DropShipper-Desktop-Setup.exe'

const CARTES = [
  {
    icone: Layers,
    titre: 'Importer en lot les produits gagnants du jour',
    texte:
      "C'est ce que l'application facilite le plus. Mode tout automatique activé, elle importe chaque jour d'un coup les produits gagnants de la liste du jour, une adresse par produit : vous choisissez la marge minimale (20 % par défaut) et les rayons à prendre (aucun coché = tous les rayons du jour). Chaque produit devient une annonce réécrite par l'IA, rangée dans Mes annonces. Une limite d'imports par jour, facultative, protège votre solde : chaque import coûte des drops, et l'application s'arrête net quand le solde est vide.",
  },
  {
    icone: Send,
    titre: 'Le mode tout automatique',
    texte:
      "Un interrupteur suffit : les produits importés, ceux de la liste du jour comme ceux envoyés depuis votre téléphone, sont mis en file sur les plateformes où vous avez activé l'agent, et, si vous le cochez, publiés aussi sur vos réseaux sociaux reliés. Fermer la fenêtre ne coupe rien : l'application reste dans la zone de notification de Windows.",
  },
  {
    icone: Share2,
    titre: 'Envoyer un produit vers votre liste',
    texte:
      "Collez ou déposez un lien sur la fenêtre, ou passez par le menu de la zone de notification : le produit rejoint la liste à importer, la même que celle de votre téléphone. La capture du presse-papiers existe aussi, coupée par défaut.",
  },
  {
    icone: AppWindow,
    titre: 'Publier dans votre propre session',
    texte:
      "Vinted, Leboncoin et Facebook Marketplace s'ouvrent dans l'application, où vous vous connectez vous-même : vos identifiants ne passent jamais chez nous. L'application prépare le formulaire de dépôt avec votre annonce. Le mode automatique ne démarre qu'avec votre accord, avec des plafonds et un espacement par plateforme, un journal de chaque publication, et il s'arrête au premier captcha ou blocage. Sur Vinted et Leboncoin, la catégorie reste à choisir par vous.",
  },
  {
    icone: ClipboardList,
    titre: 'Préparer les commandes chez les fournisseurs sans API',
    texte:
      "Pour une vente dont le fournisseur n'est pas relié, l'application ouvre sa boutique dans votre session, choisit la variante de la vente, ajoute au panier et remplit l'adresse du client. Elle s'arrête à l'écran de paiement : c'est vous qui payez, puis vous cliquez « J'ai payé ». Aucun champ de carte n'est lu ni rempli.",
  },
  {
    icone: Monitor,
    titre: 'Le site en pleine page, et DESKTOP POWER',
    texte:
      "L'application ouvre drop-shipper.fr lui-même, en pleine page, avec son menu. Connectez-vous une fois (avec Google, la connexion passe par votre navigateur) et le poste se relie tout seul à votre compte. La section DESKTOP POWER du menu y prend vie : WebShipper (le navigateur intégré), SmartMarket, RemoteShipping, AdsAnalyser, AUTO-SHIPPER Importer et MarketPlus.",
  },
]

export default function ApplicationDesktop() {
  return (
    <Layout>
      <div className="flex items-center gap-2.5">
        <Monitor size={22} className="text-[var(--marque-orange)]" />
        <h1 className="text-xl font-extrabold tracking-wide">APPLICATION DESKTOP</h1>
      </div>
      <p className="mb-5 mt-0.5 text-xs text-gray-500">
        DropShipper Desktop, pour Windows : l'import en lot des produits gagnants, la publication dans votre session et la préparation des commandes fournisseurs, depuis votre ordinateur.
      </p>

      <section className="case-ds p-4">
        <h2 className="text-sm font-bold">Installer l'application</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">
          Téléchargez l'installeur, lancez-le, puis connectez-vous dans la fenêtre avec votre compte DropShipper IA.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={LIEN_DESKTOP} className="btn-gradient inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold">
            <Download size={16} /> Télécharger pour Windows
          </a>
        </div>
        <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-gray-400">
          <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-300" />
          <span>
            L'installeur n'est pas encore signé : Windows peut afficher « Éditeur inconnu ». Cliquez « Informations complémentaires », puis « Exécuter quand même ».
          </span>
        </p>
      </section>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {CARTES.map((c) => (
          <section key={c.titre} className="case-ds p-4">
            <div className="flex items-center gap-2">
              <c.icone size={18} className="text-[var(--marque-rose)]" />
              <h2 className="text-sm font-bold">{c.titre}</h2>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">{c.texte}</p>
          </section>
        ))}
      </div>
    </Layout>
  )
}
