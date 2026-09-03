import { Link } from 'react-router-dom'
import { Puzzle, Link2, ListPlus, Plug, FileSpreadsheet, Download } from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'

/**
 * L'accueil de la section Acquisition : ses statistiques, puis ses voies.
 *
 * **Voulue par la découpe du 03/09/2026** : « ACQUISITION PRODUITS —
 * explications acquisition : url, extension, api, scraping, etc. — extension
 * chrome ». Un vendeur qui arrive ici doit comprendre en une page par où un
 * produit peut entrer, et pourquoi certaines voies sont fermées sur certains
 * sites — le dire d'avance vaut mieux que le laisser découvrir sur un échec.
 */

const VOIES = [
  {
    icone: Link2,
    titre: "L'import par adresse",
    texte:
      "Collez l'adresse d'une fiche produit dans « Mes annonces » : le serveur lit la page, l'IA réécrit l'annonce, les photos sont filigranées. La voie la plus simple — mais elle ne marche pas partout : Temu, AliExpress, Shein et JoyBuy construisent leurs fiches en JavaScript, et un serveur n'en reçoit qu'une coquille vide. Sur ces sites, l'import est refusé avec renvoi vers l'extension.",
    action: { label: 'Importer par adresse', to: '/dashboard' },
  },
  {
    icone: Puzzle,
    titre: "L'extension Chrome",
    texte:
      "Elle lit la fiche dans votre navigateur, pendant qu'elle est affichée — c'est la seule voie possible sur Temu, AliExpress et Shein. Un bouton se pose sur chaque fiche produit ; vous choisissez les photos, l'import part avec ce que la page montrait vraiment : prix, variantes, galerie.",
    action: null,
  },
  {
    icone: ListPlus,
    titre: "L'import en lot",
    texte:
      "Le panneau latéral de l'extension garde une liste pendant que vous naviguez de fiche en fiche : « Ajouter ce produit », jusqu'à vingt-cinq, puis un seul clic importe tout. Chaque fiche est relevée au moment où vous l'ajoutez — jamais après coup, jamais de mémoire.",
    action: null,
  },
  {
    icone: Plug,
    titre: 'Les fournisseurs reliés par API',
    texte:
      "BigBuy, CJ Dropshipping et AliExpress (par clé) se branchent dans la section Sourcing : le catalogue s'interroge directement, les prix et les stocks se relèvent, et les commandes fournisseur peuvent partir toutes seules après une vente.",
    action: { label: 'Brancher un fournisseur', to: '/fournisseurs' },
  },
  {
    icone: FileSpreadsheet,
    titre: 'Les listes exportées',
    texte:
      "AliExpress Business exporte une sélection en fichier — identifiants, titres, adresses, rien de plus. C'est suffisant si le fournisseur est relié par API : l'identifiant permet alors de demander la fiche complète, photos et prix compris.",
    action: null,
  },
]

export default function Acquisition() {
  return (
    <Layout>
      <h1 className="text-xl font-extrabold tracking-wide">ACQUISITION PRODUITS</h1>
      <p className="mt-0.5 mb-5 text-xs text-gray-500">
        Par où un produit entre dans votre catalogue — et pourquoi certaines voies sont fermées sur certains sites.
      </p>

      <BlocSection id="acquisition" />

      <div className="space-y-3">
        {VOIES.map((v) => (
          <section key={v.titre} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <v.icone size={18} className="mt-0.5 shrink-0 text-purple-300" />
              <div className="min-w-0">
                <h2 className="text-sm font-bold">{v.titre}</h2>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">{v.texte}</p>
                {v.action ? (
                  <Link
                    to={v.action.to}
                    className="mt-2 inline-block rounded-lg border border-purple-400/40 px-3 py-1.5 text-xs font-semibold text-purple-200 hover:bg-purple-500/10"
                  >
                    {v.action.label}
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        ))}
      </div>

      {/* L'installation détaillée a sa propre page depuis le 04/09/2026 ;
          l'ancre reste pour les anciens liens /acquisition#extension. */}
      <section id="extension" className="mt-5 rounded-2xl border border-purple-400/25 bg-purple-500/[0.06] p-4">
        <div className="flex items-start gap-3">
          <Puzzle size={18} className="mt-0.5 shrink-0 text-purple-300" />
          <div>
            <h2 className="text-sm font-bold">Installer l'extension Chrome</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-400">
              Téléchargement, installation pas à pas et mode d'emploi complet — import à l'unité, volet des lots,
              remplissage des formulaires de vente — sur la page dédiée.
            </p>
            <Link
              to="/extension"
              className="btn-gradient mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
            >
              <Download size={15} />
              <span>Ouvrir la page de l'extension</span>
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  )
}
