import { Plug } from 'lucide-react'

/**
 * Le cap des connecteurs, affiché partout où l'on relie quelque chose.
 *
 * Demandé le 17/09/2026 : le vendeur doit lire, sur chaque écran de
 * raccordement (fournisseurs, places de marché, clés API), que l'avenir des
 * connexions est le MCP — et que nous y travaillons. Le texte dit ce qui est
 * vrai : « nous étudions et développons », pas « c'est disponible ». Une
 * promesse datée vaut mieux qu'une promesse floue, mais une promesse fausse
 * vaut moins que rien.
 *
 * Un seul composant, pour que la phrase soit la même partout et se corrige à
 * un seul endroit le jour où la première connexion MCP est en ligne.
 */
export function BandeauMCP({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-purple-400/30 bg-purple-400/10 ${
        compact ? 'mt-3 p-3' : 'mt-4 max-w-3xl p-4'
      }`}
    >
      <Plug size={compact ? 14 : 18} className="mt-0.5 shrink-0 text-purple-300" />
      <div className={compact ? 'text-xs leading-relaxed' : 'text-sm leading-relaxed'}>
        <p className="font-bold text-purple-200">L'avenir des connecteurs est au MCP</p>
        <p className="mt-1 text-gray-300">
          Le <b>Model Context Protocol</b> est le protocole ouvert par lequel une IA se branche
          directement sur un service — fournisseur, place de marché, régie — sans clé à recopier ni
          formulaire à remplir. <b>Nous étudions et développons actuellement des solutions de
          connexion MCP</b> pour nos fournisseurs et nos places de marché.
          {compact ? null : ' Les raccordements ci-dessous restent la voie d’aujourd’hui.'}
        </p>
      </div>
    </div>
  )
}
