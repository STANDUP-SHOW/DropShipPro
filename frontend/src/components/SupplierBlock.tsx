import { Link } from 'react-router-dom'
import { AlertTriangle, Check, ChevronDown, ExternalLink, Link2, Puzzle } from 'lucide-react'
import { PlatformLogo } from './PlatformLogo'
import { FormulaireFournisseur } from './SupplierCredentialDialog'
import type { api } from '../lib/api'

type Supplier = Awaited<ReturnType<typeof api.listSuppliers>>[number]
type Lien = Awaited<ReturnType<typeof api.listSupplierLinks>>[number]

const CHEMIN: Record<string, string> = {
  extension: 'Extension seulement',
  url: 'Adresse collée',
  'les-deux': 'Adresse ou extension',
}

/**
 * Un fournisseur, replié sur une ligne et dépliable sur place.
 *
 * Ce que ça remplace : une grille de cartes qui tronquait la description à deux
 * lignes et cachait la mise en garde — celle qui dit « livre en Inde seulement »
 * ou « aucune place de marché n'accepte ces produits ». Il fallait ouvrir une
 * fenêtre pour la lire, et la fenêtre cachait à son tour la fiche pendant qu'on
 * y collait sa clé.
 *
 * Deux cas, et le second était le parent pauvre :
 *
 * **Avec API.** Le dépliage montre ce qu'elle permet, ce qu'il faut pour y
 * accéder, et les champs à remplir — la fiche reste sous les yeux.
 *
 * **Sans API.** Il n'y avait rien : la carte n'était même pas cliquable, comme
 * si le fournisseur n'existait qu'à moitié. Or il s'importe très bien, et c'est
 * exactement ce que le vendeur a besoin de lire.
 */
export function SupplierBlock({
  supplier,
  lien,
  aCommander,
  ouvert,
  onBasculer,
  onSaved,
}: {
  supplier: Supplier
  lien: Lien | undefined
  aCommander: number
  ouvert: boolean
  onBasculer: () => void
  onSaved: () => void
}) {
  const relie = Boolean(lien?.connected)

  return (
    <li className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <button
        type="button"
        onClick={onBasculer}
        className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-white/[0.08]"
      >
        <PlatformLogo
          id={supplier.id}
          label={supplier.label}
          color={supplier.color}
          domain={supplier.domain}
        />

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{supplier.label}</span>
            {supplier.api ? (
              relie ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300">
                  <Check size={10} />
                  <span>relié</span>
                </span>
              ) : (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-gray-400">
                  API disponible
                </span>
              )
            ) : (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-gray-500">
                {CHEMIN[supplier.importPath] ?? supplier.importPath}
              </span>
            )}
            {aCommander > 0 ? (
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-200">
                {`${aCommander} à commander`}
              </span>
            ) : null}
          </p>
          {/* Repliée, la ligne dit l'origine : c'est elle qui décide du délai,
              donc la première chose qu'on regarde. */}
          <p className="truncate text-[11px] text-gray-500">{supplier.origine}</p>
        </div>

        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-400 transition ${ouvert ? '' : '-rotate-90'}`}
        />
      </button>

      {ouvert ? (
        <div className="border-t border-white/10 p-4">
          <p className="text-sm leading-relaxed text-gray-300">{supplier.quoi}</p>

          {supplier.attention ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{supplier.attention}</span>
            </p>
          ) : null}

          {supplier.api ? (
            <div className="mt-4">
              <FormulaireFournisseur supplier={supplier} lien={lien} onSaved={onSaved} />
            </div>
          ) : (
            <MarcheASuivre supplier={supplier} />
          )}
        </div>
      ) : null}
    </li>
  )
}

/**
 * Comment importer d'un fournisseur qui n'a pas d'API.
 *
 * « Sans API » n'est pas une fin de non-recevoir : c'est la majorité des
 * fournisseurs, et ils s'importent très bien. Ce qui manquait, c'était de dire
 * comment — le vendeur voyait une carte grisée et en concluait que le
 * fournisseur ne servait à rien.
 *
 * Le chemin dépend du fournisseur, et c'est le catalogue qui le sait : certains
 * sites construisent leur fiche en JavaScript et ne rendent qu'une page vide à
 * un client HTTP. Pour ceux-là, l'adresse collée ne marchera jamais, et le dire
 * évite d'essayer trois fois avant de renoncer.
 */
function MarcheASuivre({ supplier }: { supplier: Supplier }) {
  const parExtension = supplier.importPath !== 'url'
  const parAdresse = supplier.importPath !== 'extension'

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Comment importer de ce fournisseur
      </p>

      {parAdresse ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Link2 size={14} className="text-purple-300" />
            <span>Par l'adresse du produit</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">
            {`Copiez l'adresse de la fiche produit chez ${supplier.label}, collez-la dans « Importer un produit ». Le titre, le prix et les photos sont relevés, puis réécrits.`}
          </p>
          <Link
            to="/dashboard"
            className="btn-gradient mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            Importer un produit
          </Link>
        </div>
      ) : null}

      {parExtension ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Puzzle size={14} className="text-purple-300" />
            <span>Par l'extension Chrome</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">
            {supplier.importPath === 'extension'
              ? `${supplier.label} construit sa fiche en JavaScript : un serveur qui va la lire ne reçoit qu'une page vide. L'extension, elle, lit la page déjà affichée dans votre navigateur — c'est la seule voie qui marche ici.`
              : `Sur une fiche produit, un bouton « Ajouter à DropShipper IA » apparaît en bas à droite. Il capture plus de photos que l'adresse collée, et lit les variantes proposées.`}
          </p>
          <ol className="mt-2 list-inside list-decimal space-y-0.5 text-[11px] leading-relaxed text-gray-500">
            <li>Installez l'extension, et connectez-vous dedans.</li>
            <li>{`Ouvrez une fiche produit sur ${supplier.domain}.`}</li>
            <li>Autorisez ce site depuis le panneau de l'extension — une fois pour toutes.</li>
            <li>Cliquez le bouton qui apparaît en bas à droite.</li>
          </ol>
          <Link
            to="/settings"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/5"
          >
            Télécharger l'extension
          </Link>
        </div>
      ) : null}

      <a
        href={`https://${supplier.domain}`}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 text-xs text-purple-300 hover:underline"
      >
        <span>{`Ouvrir ${supplier.label}`}</span>
        <ExternalLink size={11} />
      </a>
    </div>
  )
}
