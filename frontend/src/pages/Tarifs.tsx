import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'

/**
 * Public pricing page. Displays the drops tariff for all actions and purchase packs.
 *
 * This page is accessible to the public and linked from the Shopify app
 * and other integrations.
 */

interface ActionCost {
  name: string
  drops: number
  euros: number
  description: string
}

interface PricePack {
  drops: number
  amount: number
  discount: string
}

const ACTIONS_COST: ActionCost[] = [
  // Core operations
  {
    name: 'Importer une annonce',
    drops: 12,
    euros: 0.12,
    description: 'Scraper + réécrire une fiche produit',
  },
  {
    name: 'Importer en lot (par annonce)',
    drops: 8,
    euros: 0.08,
    description: 'Réécriture différée (−50 % vs import unique)',
  },
  {
    name: 'Réécrire une annonce',
    drops: 10,
    euros: 0.10,
    description: 'Refaire la réécriture existante',
  },

  // Analysis
  {
    name: 'Analyse de marché',
    drops: 30,
    euros: 0.30,
    description: 'Analyse complète par produit (recherches web)',
  },
  {
    name: 'Contrôle photo (IA)',
    drops: 10,
    euros: 0.10,
    description: 'Vision Sonnet sur les photos importées',
  },
  {
    name: 'Produit gagnant extrait',
    drops: 5,
    euros: 0.05,
    description: 'Identifié et archivé (non publié)',
  },
  {
    name: 'Produit gagnant publié',
    drops: 6,
    euros: 0.06,
    description: 'Identifié, importé ET publié',
  },

  // Agents
  {
    name: 'Question au comptoir',
    drops: 5,
    euros: 0.05,
    description: 'Support technique, commercial, SAV',
  },
  {
    name: 'Question au chef de rayon',
    drops: 25,
    euros: 0.25,
    description: 'Conseil approfondi avec recherches',
  },
  {
    name: 'Conseil produit',
    drops: 40,
    euros: 0.40,
    description: 'Analyse détaillée (5 recherches)',
  },

  // Creative
  {
    name: 'Générer une image',
    drops: 18,
    euros: 0.18,
    description: 'Photo en situation (Generative Fill)',
  },
  {
    name: 'Créer une publicité',
    drops: 20,
    euros: 0.20,
    description: 'Accroche + visuel composé',
  },

  // Automation
  {
    name: 'AUTO-SHIPPER (journée)',
    drops: 100,
    euros: 1.00,
    description: 'Import, publication et réglages automatiques',
  },
  {
    name: 'AUTO-SHIPPER (par produit)',
    drops: 18,
    euros: 0.18,
    description: 'Agent (6) + annonce (12)',
  },

  // DropShop
  {
    name: 'DropShop IA (création)',
    drops: 350,
    euros: 3.50,
    description: 'Boutique personnalisée + 10 modifications',
  },
  {
    name: 'DropShop (modification)',
    drops: 10,
    euros: 0.10,
    description: 'Au-delà des 10 modifications comprises',
  },
  {
    name: 'DropShop Back Office',
    drops: 300,
    euros: 3.00,
    description: 'Admin indépendante : commandes, produits, réglages',
  },
]

const PRICE_PACKS: PricePack[] = [
  { drops: 500, amount: 500, discount: '' },
  { drops: 1000, amount: 1000, discount: '' },
  { drops: 2000, amount: 2000, discount: '' },
  { drops: 5000, amount: 4500, discount: '−10 %' },
  { drops: 10000, amount: 8000, discount: '−20 %' },
  { drops: 20000, amount: 15000, discount: '−25 %' },
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

export default function Tarifs() {
  return (
    <div className="min-h-screen bg-app-gradient text-white">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <Link to="/">
          <Logo />
        </Link>
        <Link to="/" className="text-sm text-gray-300 hover:text-white">
          Retour à l'accueil
        </Link>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-20">
        <h1 className="text-3xl font-bold">Tarifs et formules</h1>
        <p className="mt-2 text-sm text-gray-400">
          Une seule monnaie : les <b>drops</b>. 1 drop = 0,01 € · Accès complet à toutes les
          fonctionnalités · Payez uniquement ce que vous consommez.
        </p>

        <Section title="Comment ça marche">
          <div className="space-y-3 text-sm text-gray-300">
            <p>
              Chaque action de DropShipper IA coûte un nombre fixe de <b>drops</b>.
            </p>
            <p>
              À l'inscription, vous recevez <b>120 drops gratuits</b> — de quoi importer 10
              annonces et tester.
            </p>
            <p>
              Quand vous en avez besoin, vous rechargez votre compte par tranches de 500 à 20 000
              drops. Plus vous en achetez, moins le drop vous coûte cher (−25 % sur 20 000).
            </p>
            <p className="text-xs text-gray-400">
              Les prix sont affichés en centimes : une facturation en drops n'a pas lieu.
            </p>
          </div>
        </Section>

        <Section title="Tarif des actions">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="text-left py-2 px-3">Action</th>
                  <th className="text-right py-2 px-3">Drops</th>
                  <th className="text-right py-2 px-3">€</th>
                  <th className="text-left py-2 px-3">Description</th>
                </tr>
              </thead>
              <tbody className="text-gray-200">
                {ACTIONS_COST.map((action, idx) => (
                  <tr key={idx} className="border-b border-gray-700 hover:bg-white/5">
                    <td className="py-3 px-3 font-medium">{action.name}</td>
                    <td className="py-3 px-3 text-right tabular-nums font-semibold text-purple-300">
                      {action.drops}
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums text-gray-400">
                      {action.euros.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-xs text-gray-400">{action.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Acheter des drops">
          <div className="space-y-3 text-sm text-gray-300 mb-4">
            <p>
              Les tarifs ci-dessous sont <b>au centime</b> (0,01 €). Facturation en euros, crédits
              en drops.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {PRICE_PACKS.map((pack) => {
              const costPerDrop = (pack.amount / 100 / pack.drops).toFixed(4)
              return (
                <div
                  key={pack.drops}
                  className="rounded-lg border border-gray-700 bg-white/5 p-4 hover:border-purple-500 hover:bg-white/10 transition-all"
                >
                  <div className="text-lg font-bold text-purple-300">{pack.drops.toLocaleString()}</div>
                  <div className="text-sm text-gray-400 mb-2">drops</div>
                  <div className="text-2xl font-bold mb-1">{(pack.amount / 100).toFixed(2)} €</div>
                  {pack.discount && (
                    <div className="text-xs font-semibold text-green-300 mb-2">{pack.discount}</div>
                  )}
                  <div className="text-xs text-gray-500">
                    {costPerDrop} €/drop
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        <Section title="Gestion du portefeuille">
          <div className="space-y-3 text-sm text-gray-300">
            <p>
              Une fois connecté, consultez votre solde de drops dans la page <b>Mes crédits</b>.
            </p>
            <p>
              Vous y trouverez aussi l'historique complet de chaque dépense et rechargement.
            </p>
            <p>
              Si vous n'avez pas assez de drops pour une action, elle vous est refusée et aucun
              débit ne s'effectue.
            </p>
          </div>
        </Section>

        <Section title="Questions">
          <div className="space-y-3 text-sm text-gray-300">
            <p>
              Pour toute question, contactez-nous à{' '}
              <a
                href="mailto:contact@drop-shipper.fr"
                className="text-purple-300 hover:text-purple-200"
              >
                contact@drop-shipper.fr
              </a>
              .
            </p>
          </div>
        </Section>

        <div className="mt-12 border-t border-gray-700 pt-6 text-center text-xs text-gray-400">
          <p>© DropShipper IA · Les tarifs affichés ici s'appliquent aussi aux intégrations.</p>
        </div>
      </main>
    </div>
  )
}
