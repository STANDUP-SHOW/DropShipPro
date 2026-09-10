import { Link } from 'react-router-dom'
import { useExtensionVersion } from '../lib/extensionVersion'
import { useDemo } from '../lib/demo'

/**
 * Le bloc « Extension Google Chrome », à côté des notifications.
 *
 * Demandé le 10/09/2026, et il remplace le bandeau d'avertissement en haut des
 * pages. Le raisonnement : l'extension est au Chrome Web Store, donc une version
 * en retard n'est plus un problème à signaler en gros — Chrome la met à jour
 * tout seul, en quelques heures. On montre juste un CURSEUR BICOLORE : à jour
 * (vert) ou mise à jour en cours (ambre). Le détail jaune ne s'affiche qu'au
 * SURVOL, et sur la page Extension — nulle part ailleurs.
 *
 * Tout le bloc mène à la page de l'extension.
 */

/** Le logo Chrome, en petit. */
function ChromeGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="shrink-0">
      <circle cx="24" cy="24" r="9" fill="#fff" />
      <path d="M24 4a20 20 0 0 1 17.32 10H24a10 10 0 0 0-9.53 6.94L6.7 13.9A20 20 0 0 1 24 4Z" fill="#ea4335" />
      <path d="M6.7 13.9 14.47 27.4A10 10 0 0 0 24 34c.7 0 1.37-.07 2.02-.2l-7.7 13.34A20 20 0 0 1 6.7 13.9Z" fill="#34a853" />
      <path d="M41.32 14A20 20 0 0 1 26.02 47.8L33.7 34.4A10 10 0 0 0 34 14Z" fill="#fbbc05" />
      <circle cx="24" cy="24" r="6" fill="#4285f4" />
    </svg>
  )
}

export function BlocExtension() {
  const { presente, enRetard, installee, servie } = useExtensionVersion()
  const [demo] = useDemo()

  // Trois états : à jour, mise à jour en cours, non installée. En mode démo, la
  // pilule du tableau de bord commande tout le site : l'extension est montrée
  // « à jour », comme le reste de la démonstration.
  const etat = demo ? 'ajour' : !presente ? 'absente' : enRetard ? 'maj' : 'ajour'
  // La version affichée : en démo, la version servie (ou un repère) fait foi.
  const versionAffichee = demo ? servie ?? '1.30.0' : installee
  const config = {
    ajour: { label: 'À jour', teinte: '#34d399', cote: 'gauche' as const },
    maj: { label: 'Mise à jour en cours', teinte: '#fbbf24', cote: 'droite' as const },
    absente: { label: 'Non installée', teinte: '#6b7280', cote: 'gauche' as const },
  }[etat]

  return (
    <Link
      to="/extension"
      className="group relative flex h-full flex-col rounded-2xl border border-white/[0.12] bg-white/[0.05] p-4 backdrop-blur-2xl"
    >
      <header className="mb-3 flex items-center gap-2.5 border-b border-white/10 pb-2">
        <ChromeGlyph size={20} />
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-200">Extension Google Chrome</h2>
      </header>

      <div className="flex flex-1 items-center gap-3">
        {/* L'icône de l'extension, la même que la marque et le Web Store. */}
        <img
          src="/favicon-128.png"
          width={40}
          height={40}
          alt=""
          aria-hidden
          className="shrink-0 rounded-[26%]"
          style={{ width: 40, height: 40 }}
        />

        <div className="min-w-0 flex-1">
          {/* Le curseur bicolore : à jour (vert) ↔ mise à jour (ambre). */}
          <div className="relative h-6 w-full max-w-[190px] overflow-hidden rounded-full border border-white/10">
            <div className="absolute inset-0 flex">
              <span className="flex-1" style={{ background: 'rgba(52,211,153,0.18)' }} />
              <span className="flex-1" style={{ background: 'rgba(251,191,36,0.18)' }} />
            </div>
            {/* Le curseur, posé sur la moitié active. */}
            <span
              className="absolute top-0.5 bottom-0.5 w-[calc(50%-3px)] rounded-full transition-all duration-300"
              style={{
                left: config.cote === 'gauche' ? '3px' : 'calc(50% + 0px)',
                background: config.teinte,
                boxShadow: `0 0 10px ${config.teinte}`,
              }}
            />
          </div>
          <p className="mt-1.5 text-xs font-semibold" style={{ color: config.teinte }}>
            {config.label}
          </p>
          {versionAffichee ? (
            <p className="text-[10px] text-gray-500">
              Version {versionAffichee}
              {servie && enRetard && !demo ? ` → ${servie}` : ''}
            </p>
          ) : (
            <p className="text-[10px] text-gray-500">Cliquez pour l'installer</p>
          )}
        </div>
      </div>

      {/* L'avertissement jaune, au SURVOL seulement, et seulement en retard :
          Chrome met à jour tout seul, inutile d'alarmer en permanence. */}
      {enRetard && !demo ? (
        <div className="pointer-events-none absolute left-3 right-3 top-full z-40 mt-1 rounded-xl border border-amber-400/30 bg-[#211a10] p-3 text-[11px] leading-relaxed text-amber-100 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
          Votre extension est en {installee}, la version {servie} est disponible. Elle est sur le Chrome
          Web Store et se met à jour toute seule — Chrome propage en quelques heures. Si l'ancienne
          version persiste, c'est sans doute la copie « mode développeur » : retirez-la depuis
          chrome://extensions et gardez celle du store.
        </div>
      ) : null}
    </Link>
  )
}
