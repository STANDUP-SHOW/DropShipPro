import { Link } from 'react-router-dom'
import { KeyRound, Info } from 'lucide-react'
import { Layout } from '../components/Layout'
import { PlatformCredentials } from '../components/PlatformCredentials'
import { AdAccounts } from '../components/AdAccounts'
import { ApiKeys } from '../components/ApiKeys'

/**
 * Toutes les clés, au même endroit.
 *
 * Elles étaient réparties sur trois écrans : les clés de place de marché dans
 * les Réglages, les comptes publicitaires dans Marketing, les clés de dépôt
 * ailleurs encore. Un vendeur qui vient brancher quelque chose ne sait pas de
 * quelle famille relève ce qu'il tient en main — il sait juste qu'il a une clé.
 *
 * Rien n'est dupliqué : ce sont les mêmes blocs qu'ailleurs, montés ici aussi.
 * Une valeur enregistrée d'un côté est enregistrée des deux.
 */
export default function ApiLinks() {
  return (
    <Layout>
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <KeyRound size={22} className="text-emerald-400" />
        <span>API Connect — mes clés et raccordements</span>
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-400">
        Le côté vente : les sites et places de marché où vous publiez, les régies où vous faites de
        la publicité, et les clés que vos propres outils utilisent pour déposer dans votre
        catalogue. Pour relier vos <b>fournisseurs</b>, c'est l'autre page :{' '}
        <Link to="/api-sourcing-connect" className="text-purple-300 underline">
          API Sourcing Connect
        </Link>
        .
      </p>

      <div className="mt-4 flex max-w-3xl items-start gap-2 rounded-xl border border-sky-400/25 bg-sky-400/10 p-3">
        <Info size={14} className="mt-0.5 shrink-0 text-sky-300" />
        <p className="text-xs leading-relaxed text-sky-100">
          Aucun secret n'est réaffiché une fois enregistré : ni un jeton de place de marché, ni un
          jeton de régie, ni une clé de dépôt. Vous voyez qu'ils sont là, jamais leur valeur — une
          base qui fuit ne doit pas distribuer des accès en état de marche.
        </p>
      </div>

      {/* ---------- Places de marché ---------- */}
      <PlatformCredentials />

      {/* ---------- Régies publicitaires ---------- */}
      <div className="max-w-3xl">
        <AdAccounts />
      </div>

      {/* ---------- Clés de dépôt du catalogue ---------- */}
      <ApiKeys />
    </Layout>
  )
}
