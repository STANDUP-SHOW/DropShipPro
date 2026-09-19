import { useState } from 'react'
import { Plug } from 'lucide-react'

/** L'accent du bloc, repris des blocs du tableau de bord (violet). */
const ACCENT = '#a78bfa'

/**
 * Le logo MCP, ou son repli.
 *
 * Le fichier est attendu sous `public/logos/mcp.png` — un nom convenu, pour
 * que le déposer suffise, sans rien recompiler. Tant qu'il manque, la prise
 * dessinée tient la place : un cadre vide à gauche du texte se lirait comme
 * une panne d'affichage, alors qu'il ne manque qu'une image.
 */
function LogoMCP({ largeur, minimum }: { largeur: number; minimum: number }) {
  const [casse, setCasse] = useState(false)

  return (
    // La colonne s'étire sur toute la hauteur du cadre (`items-stretch` du
    // parent) et centre son contenu : le logo est donc à la hauteur du cadre
    // et centré dessus, quelle que soit la longueur du texte à côté.
    <div
      style={{ width: largeur, minHeight: minimum }}
      className="flex shrink-0 items-center justify-center self-stretch"
    >
      {casse ? (
        <span
          aria-hidden
          style={{ width: minimum, height: minimum, backgroundColor: `${ACCENT}1f`, borderColor: `${ACCENT}59` }}
          className="grid place-items-center rounded-xl border"
        >
          <Plug size={Math.round(minimum * 0.45)} style={{ color: ACCENT }} />
        </span>
      ) : (
        // La pastille claire est celle de `PlatformLogo` : la marque MCP est
        // publiee en noir sur blanc, et posee telle quelle sur le verre sombre
        // du bloc elle disparaitrait. Le fond ne retouche pas le logo, il lui
        // rend le sien.
        <img
          src="/logos/mcp.png"
          alt="Model Context Protocol"
          onError={() => setCasse(true)}
          className="max-h-full w-full rounded-xl bg-white/90 object-contain p-2"
        />
      )}
    </div>
  )
}

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
 *
 * **Refondu le 19/09/2026** sur le modèle des blocs du tableau de bord
 * (`BlocStats`) : verre dépoli pleine largeur, en-tête coloré « Infos MCP »
 * avec son icône dans une pastille pleine, filet de la même couleur dessous.
 * Un encadré violet sans titre au milieu d'une page se lisait comme un
 * avertissement ; le même contenu sous un en-tête de section se lit comme une
 * information. Le texte, lui, n'a pas bougé de taille : le bloc s'élargit,
 * il ne grossit pas.
 */
export function BandeauMCP({ compact = false }: { compact?: boolean }) {
  return (
    <section
      className={`w-full rounded-2xl border border-white/[0.12] bg-white/[0.05] backdrop-blur-2xl ${
        compact ? 'mt-3 p-3' : 'mt-4 p-4'
      }`}
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 12px 40px rgba(0,0,0,0.35)' }}
    >
      <header className="flex items-center gap-2.5 border-b pb-2" style={{ borderColor: `${ACCENT}33` }}>
        <span className="grid h-6 w-6 place-items-center rounded-md text-black/80" style={{ backgroundColor: ACCENT }}>
          <Plug size={14} />
        </span>
        <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: ACCENT }}>
          Infos MCP
        </h2>
      </header>

      {/* Le logo à gauche, centré sur la hauteur du cadre ; le texte garde la
          taille qu'il avait. */}
      <div className={`flex items-stretch gap-4 ${compact ? 'mt-2.5' : 'mt-3'}`}>
        <LogoMCP largeur={compact ? 56 : 104} minimum={compact ? 44 : 72} />
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
    </section>
  )
}
