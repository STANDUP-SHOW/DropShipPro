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
 * Un fournisseur, en carte, trois par ligne comme dans la maquette de Max
 * (14/10/2026), et dépliable sur place.
 *
 * Repliée, la carte dit l'essentiel : le statut du raccordement, l'origine
 * (c'est elle qui décide du délai), ce que le fournisseur vend, et si une mise
 * en garde existe — celle qui dit « livre en Inde seulement » ne doit jamais
 * se cacher. Ouverte, elle prend toute la largeur de la grille : le formulaire
 * de clés et la marche à suivre ne se remplissent pas dans un tiers d'écran.
 *
 * **Avec API.** Le dépliage montre ce qu'elle permet et les champs à remplir.
 * **Sans API.** Il montre comment importer quand même : c'est la majorité des
 * fournisseurs, et ils s'importent très bien.
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
    <li className={`case-ds flex min-w-0 flex-col p-4 ${ouvert ? 'md:col-span-2 lg:col-span-3' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <PlatformLogo
          id={supplier.id}
          label={supplier.label}
          color={supplier.color}
          size={40}
          domain={supplier.domain}
        />
        <div className="flex flex-wrap justify-end gap-1.5">
          {supplier.api ? (
            relie ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                <Check size={10} />
                <span>Relié</span>
              </span>
            ) : (
              <span className="rounded-md bg-[var(--marque-rose)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--marque-rose)]">
                API disponible
              </span>
            )
          ) : (
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--texte-2)]">
              {CHEMIN[supplier.importPath] ?? supplier.importPath}
            </span>
          )}
          {aCommander > 0 ? (
            <span className="rounded-md bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
              {`${aCommander} à commander`}
            </span>
          ) : null}
        </div>
      </div>

      <h3 className="mt-3 text-base font-bold text-[var(--texte)]">{supplier.label}</h3>
      <p className="text-[11px] text-[var(--texte-3)]">{supplier.origine}</p>
      <p className={`mt-2 flex-1 text-xs leading-relaxed text-[var(--texte-2)] ${ouvert ? '' : 'line-clamp-3'}`}>
        {supplier.quoi}
      </p>

      {supplier.attention ? (
        ouvert ? (
          <p className="mt-2.5 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-2.5 text-xs leading-relaxed text-amber-100">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{supplier.attention}</span>
          </p>
        ) : (
          <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-amber-300">
            <AlertTriangle size={11} />
            <span>À savoir avant d'importer</span>
          </p>
        )
      ) : null}

      <button
        type="button"
        onClick={onBasculer}
        aria-expanded={ouvert}
        className="mt-3 inline-flex items-center gap-1 self-start rounded-lg border border-[var(--trait)] px-3 py-1.5 text-xs font-semibold text-[var(--texte)] transition hover:border-[var(--trait-fort)] hover:bg-white/[0.04]"
      >
        <span>{ouvert ? 'Réduire' : supplier.api && !relie ? 'Relier mon compte' : supplier.api ? 'Voir le raccordement' : 'Comment importer'}</span>
        <ChevronDown size={13} className={`transition ${ouvert ? 'rotate-180' : ''}`} />
      </button>

      {ouvert ? (
        <div className="mt-3 border-t border-[var(--trait)] pt-3">
          {supplier.api ? (
            <FormulaireFournisseur supplier={supplier} lien={lien} onSaved={onSaved} />
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
    <div className="space-y-3">
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
            {`Copiez l'adresse de la fiche produit chez ${supplier.label}, collez-la dans « Acquérir des produits ». Le titre, le prix et les photos sont relevés, puis réécrits.`}
          </p>
          <Link
            to="/acquisition"
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
            to="/extension"
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
