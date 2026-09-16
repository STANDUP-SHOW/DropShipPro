import { Link } from 'react-router-dom'
import { useExtensionVersion } from '../lib/extensionVersion'

/**
 * La tuile « Extension Chrome », au gabarit des jauges du dessus.
 *
 * **Ce qu'elle ne dit plus, et pourquoi.** Elle annonçait « À jour » avec un
 * numéro de version. Les deux étaient contestables et le vendeur l'a vu tout de
 * suite le 16/09/2026 : « dans Chrome la 1.35 est chargée, dans l'appli je lis
 * 1.32, votre appli est à jour — un gros bloc qui dit des trucs faux ».
 *
 * Deux fautes distinctes, et la seconde est la vraie :
 *
 * 1. **« À jour » est une comparaison qu'on ne peut pas faire.** Le Chrome Web
 *    Store ne lit pas notre dépôt ; nous ignorons ce qu'il sert. C'était déjà la
 *    leçon du 15/09, et il restait ce mot pour la contredire.
 * 2. **Il avait DEUX copies installées** — celle du store et la sienne chargée à
 *    la main —, l'écran en choisissait une et n'en disait rien. Un écran qui
 *    tranche en silence est indiscernable d'un écran faux : il n'y a aucun moyen,
 *    pour celui qui le lit, de savoir lequel des deux il est.
 *
 * Elle dit donc ce qui se sait : combien de copies répondent, d'où elles
 * viennent, et quelle version chacune annonce. Le reste est sur la page
 * Extension, où il y a la place de l'expliquer.
 */

/** Le logo Chrome, en petit. */
function ChromeGlyph({ size = 18 }: { size?: number }) {
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
  const { presente, store, copieDev, deuxCopies, versionStore, versionManuelle } =
    useExtensionVersion()

  /*
   * **Le mode démonstration ne commande PAS cette tuile**, contrairement au
   * reste du bandeau — et c'est un revirement assumé du 16/09/2026.
   *
   * La pilule DEMO peuple le tableau de bord de chiffres d'affaires plausibles
   * pour qu'un prospect voie une boutique vivante. Ce sont des chiffres de
   * commerce. L'extension, elle, n'est pas un chiffre de commerce : c'est un
   * fait sur LA MACHINE de celui qui regarde. La démonstration n'a aucune
   * autorité dessus.
   *
   * Le coût de l'ancienne règle s'est vu le jour même : dans un navigateur où
   * aucune extension n'était installée, la tuile affichait « Extension active »
   * avec un tiret pour version. Elle se contredisait dans le même souffle, et
   * elle cachait le seul renseignement utile — qu'il n'y en a pas.
   *
   * Quatre situations réelles, et chacune appelle un geste différent. Les
   * fondre en « à jour / pas à jour » est précisément ce qui produisait un
   * écran faux.
   */
  const etat = deuxCopies
      ? {
          teinte: '#fbbf24',
          valeur: versionStore ?? '—',
          label: 'Deux copies',
          detail: `Une copie du Chrome Web Store (${versionStore}) et une copie chargée à la main (${versionManuelle}) sont installées. C'est celle du store qui fait foi. Retirez l'autre depuis chrome://extensions.`,
        }
      : store
        ? {
            teinte: '#34d399',
            valeur: versionStore ?? '—',
            label: 'Extension active',
            detail: `Copie du Chrome Web Store, version ${versionStore}. Chrome la met à jour tout seul.`,
          }
        : copieDev
          ? {
              teinte: '#fbbf24',
              valeur: versionManuelle ?? '—',
              label: 'Copie manuelle',
              detail: `Version ${versionManuelle}, chargée à la main : elle ne se mettra jamais à jour. Installez celle du Chrome Web Store.`,
            }
          : {
              teinte: '#6b7280',
              valeur: '—',
              label: 'Non installée',
              detail: "Cliquez pour l'installer depuis le Chrome Web Store.",
            }

  return (
    <Link
      to="/extension"
      title={etat.detail}
      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 backdrop-blur-xl transition hover:border-white/[0.18]"
    >
      <ChromeGlyph size={18} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-extrabold leading-none" style={{ color: etat.teinte }}>
          {etat.valeur}
        </span>
        <span className="mt-1 block truncate text-[9px] font-semibold uppercase leading-tight tracking-wide text-gray-400">
          {etat.label}
        </span>
      </span>
      {presente ? (
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: etat.teinte, boxShadow: `0 0 8px ${etat.teinte}` }}
          aria-hidden
        />
      ) : null}
    </Link>
  )
}
