import { useMemo, useState } from 'react'
import { ExternalLink, Download, Send, Loader2, CheckSquare, Square } from 'lucide-react'
import { api, type ProduitRapport } from '../lib/api'
import annuaire from '../data/fournisseurs.json'

/**
 * Les produits d'un rapport : une liste d'annonces à importer, pas un tableau.
 *
 * **Un seul exemplaire de cette liste, affiché à trois endroits** — Fresh news,
 * la page Produits gagnants et le rayon concerné. La leçon vient de
 * `dspPointeVersUneAutreFiche` : une liste recopiée devient deux listes qui
 * divergent, et le vendeur voit alors un bouton « Importer » qui ne fait pas la
 * même chose selon la page d'où il l'a cliqué.
 *
 * **Deux chemins d'import, décidés par la fiche et pas par le vendeur.** Ce qui
 * se lit sans navigateur (`api`, `url`) s'importe sur-le-champ. Le reste — Temu,
 * Shein, AliExpress sans clé — construit sa page en JavaScript : aucun serveur
 * n'y verra jamais de prix, donc la fiche part dans la file de l'agent
 * extension, qui la relève dans le navigateur du vendeur. « Importer avec
 * l'extension » ouvre en plus la fiche dans un onglet, parce que c'est ce
 * geste-là qui permet à l'extension de la lire pendant qu'elle est affichée.
 *
 * **Un seul bouton d'import par ligne, toujours le moins cher** (Max,
 * 12/10/2026) : « Importer · 12 » quand la fiche se lit à l'adresse,
 * « Importer extension · 18 » (6 pour l'agent + 12 pour l'import, autre
 * couleur) seulement quand elle ne se lit pas. Proposer l'extension à côté
 * d'un import direct revenait à proposer de payer 18 ce qui en coûte 12.
 */
export interface ProduitAffiche extends ProduitRapport {
  /** D'où vient la ligne, quand la liste mélange plusieurs rapports. */
  rapportId?: string
  day?: string
  categorieNom?: string
  themeNom?: string
}

function euros(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(2).replace('.', ',')} €`
}

function dateFr(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** La clé d'une ligne : l'adresse suffit, deux rapports peuvent proposer le même produit. */
const cleDe = (p: ProduitAffiche) => p.url

/** Drops : un import (DROPS.import) et l'agent extension en plus (DROPS.agentExtension), backend/src/services/tarifs.ts. */
export const COUT_IMPORT = 12
export const COUT_EXTENSION = 6 + COUT_IMPORT

/**
 * Importe un lot par le chemin de chaque fiche : direct pour ce qui se lit à
 * l'adresse, file de l'extension pour le reste. Rend la phrase à afficher.
 * Partagé avec les cartes de la page Produits gagnants : un seul bouton
 * « Importer », quel que soit l'écran d'où on le clique.
 */
export async function importerProduits(lot: ProduitAffiche[], origine: string): Promise<string> {
  const directs = lot.filter((p) => p.import !== 'extension')
  const parExtension = lot.filter((p) => p.import === 'extension')
  let importes = 0
  let echecs = 0
  for (let i = 0; i < directs.length; i += 25) {
    const r = await api.importBatch(directs.slice(i, i + 25).map((p) => p.url))
    importes += r.imported
    echecs += r.failed
  }
  let enFile = 0
  if (parExtension.length) {
    const r = await api.fileImportAjouter(
      parExtension.map((p) => ({ url: p.url, titre: p.titre, fournisseur: p.fournisseur, mode: 'extension' as const, origine })),
    )
    enFile = r.ajoutes
  }
  const morceaux: string[] = []
  if (importes) morceaux.push(`${importes} annonce(s) importée(s)`)
  if (enFile) morceaux.push(`${enFile} fiche(s) envoyée(s) à l'extension`)
  if (echecs) morceaux.push(`${echecs} échec(s)`)
  return morceaux.length ? `${morceaux.join(' · ')}.` : 'Rien à faire : tout était déjà importé ou en file.'
}

type Fiche = { id: string; label: string; domain: string; color: string; logo?: string }
const FICHES = (annuaire as { fournisseurs: Fiche[] }).fournisseurs
/** Des noms qui sont aussi des mots (« faire », « also », « wish ») : reconnus par l'adresse ou le nom exact seulement. */
const MOTS = new Set(['faire', 'also', 'wish', 'joom'])
const sansAccents = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/**
 * Le fournisseur d'une ligne, quand il est reconnu : par l'adresse de la fiche
 * d'abord (aliexpress.com…), sinon par son nom dans le texte du rapport. Rien
 * n'est deviné : un fournisseur inconnu garde son nom, sans icône.
 */
function ficheFournisseur(p: ProduitRapport): Fiche | null {
  let hote: string[] = []
  try {
    hote = new URL(p.url).hostname.toLowerCase().split('.')
  } catch {
    /* no URL: the name only */
  }
  const nom = sansAccents(p.fournisseur || '')
  for (const f of FICHES) {
    const racine = f.domain.split('.').slice(-2)[0]
    if (hote.includes(racine)) return f
  }
  for (const f of FICHES) {
    const label = sansAccents(f.label)
    if (MOTS.has(label) ? nom.trim() === label : new RegExp(`(^|[^a-z0-9])${label.replace(/[^a-z0-9]+/g, '[^a-z0-9]*')}([^a-z0-9]|$)`).test(nom)) return f
  }
  return null
}

function IconeFournisseur({ fiche }: { fiche: Fiche }) {
  return fiche.logo ? (
    <img src={fiche.logo} alt="" width={16} height={16} loading="lazy" className="h-4 w-4 shrink-0 rounded-sm bg-white object-contain p-px" />
  ) : (
    <span
      aria-hidden
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[9px] font-bold text-white"
      style={{ background: fiche.color }}
    >
      {fiche.label.charAt(0)}
    </span>
  )
}

/** Une case de la ligne : un libellé court au-dessus, la valeur en dessous. */
function Case({ libelle, children, ton = '' }: { libelle: string; children: React.ReactNode; ton?: string }) {
  return (
    <div className="min-w-[4.5rem] rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{libelle}</p>
      <p className={`text-xs font-semibold ${ton}`}>{children}</p>
    </div>
  )
}

export function ListeProduitsRapport({
  produits,
  origine,
  avecSelection = false,
  avecProvenance = false,
  onMessage,
}: {
  produits: ProduitAffiche[]
  /** Ce qu'on note dans la file pour retrouver d'où vient la demande. */
  origine: string
  /** Cases à cocher et barre d'actions groupées — la page Produits gagnants et les rayons. */
  avecSelection?: boolean
  /** Affiche la catégorie et le jour de chaque ligne — quand la liste mélange les rapports. */
  avecProvenance?: boolean
  onMessage?: (texte: string | null) => void
}) {
  const [enCours, setEnCours] = useState<string | null>(null)
  const [coches, setCoches] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)

  function dire(texte: string | null) {
    setMessage(texte)
    onMessage?.(texte)
  }

  const selection = useMemo(() => produits.filter((p) => coches.has(cleDe(p))), [produits, coches])

  function basculer(p: ProduitAffiche) {
    setCoches((c) => {
      const s = new Set(c)
      const k = cleDe(p)
      if (s.has(k)) s.delete(k)
      else s.add(k)
      return s
    })
  }

  async function importer(lot: ProduitAffiche[], cle: string) {
    if (!lot.length) return
    setEnCours(cle)
    dire(null)
    try {
      dire(await importerProduits(lot, origine))
    } catch (e) {
      dire(e instanceof Error ? e.message : "L'import n'a pas abouti.")
    } finally {
      setEnCours(null)
    }
  }

  /**
   * Envoie à l'extension, et ouvre la fiche.
   *
   * L'onglet n'est ouvert que pour UNE fiche : vingt `window.open` d'affilée
   * sont bloqués par le navigateur, et le vendeur se retrouverait avec un seul
   * onglet ouvert en croyant les avoir tous. Pour une sélection, la file suffit
   * — le panneau de l'extension ouvre et importe chaque fiche à son tour.
   */
  async function versExtension(lot: ProduitAffiche[], cle: string, ouvrir: boolean) {
    if (!lot.length) return
    setEnCours(`${cle}:ext`)
    dire(null)
    try {
      const r = await api.fileImportAjouter(
        lot.map((p) => ({ url: p.url, titre: p.titre, fournisseur: p.fournisseur, mode: p.import, origine })),
      )
      if (ouvrir && lot.length === 1) window.open(lot[0].url, '_blank', 'noopener,noreferrer')
      dire(
        `${r.ajoutes} fiche(s) envoyée(s) à l'extension${r.dejaEnFile ? `, ${r.dejaEnFile} déjà en file` : ''}. ` +
          (ouvrir && lot.length === 1
            ? "La fiche s'ouvre dans un onglet : importez-la avec le bouton de l'extension, ou depuis sa « File d'import du site »."
            : "Ouvrez le panneau de l'extension, « File d'import du site », puis « Importer »."),
      )
    } catch (e) {
      dire(e instanceof Error ? e.message : "L'envoi n'a pas abouti.")
    } finally {
      setEnCours(null)
    }
  }

  const directs = produits.filter((p) => p.import !== 'extension').length
  const cout = (lot: ProduitAffiche[]) =>
    lot.reduce((t, p) => t + (p.import === 'extension' ? COUT_EXTENSION : COUT_IMPORT), 0)

  if (!produits.length) return null

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span>
          {produits.length} produits — {directs} importables directement, {produits.length - directs} par l'extension.
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {avecSelection && coches.size > 0 ? (
            <button
              type="button"
              disabled={enCours !== null}
              onClick={() => importer(selection, 'selection')}
              title="Chaque fiche part par l'import le moins cher : direct à 12, extension à 18 seulement quand la page ne se lit pas"
              className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              {enCours === 'selection' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              {`Importer la sélection (${coches.size}) · ${cout(selection)}`}
            </button>
          ) : (
            <button
              type="button"
              disabled={enCours !== null}
              onClick={() => importer(produits, origine)}
              title="Chaque fiche part par l'import le moins cher : direct à 12, extension à 18 seulement quand la page ne se lit pas"
              className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
            >
              {enCours === origine ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              {`Tout importer · ${cout(produits)}`}
            </button>
          )}
        </span>
      </div>

      {message ? (
        <p className="mt-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{message}</p>
      ) : null}

      <ul className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10">
        {produits.map((p) => {
          const fiche = ficheFournisseur(p)
          const cle = `${p.rapportId ?? origine}:${p.rang}`
          const coche = coches.has(cleDe(p))
          const parExtension = p.import === 'extension'
          return (
            <li key={`${p.url}-${p.rang}`} className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center">
              {avecSelection ? (
                <button
                  type="button"
                  onClick={() => basculer(p)}
                  title="Cocher pour importer en lot"
                  className="shrink-0 self-start text-gray-400 hover:text-white lg:self-center"
                >
                  {coche ? <CheckSquare size={16} className="text-emerald-400" /> : <Square size={16} />}
                </button>
              ) : null}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  <span className="text-gray-500">{p.rang}.</span> {p.titre}
                </p>
                {p.pourquoi && p.pourquoi !== '—' ? <p className="mt-0.5 text-xs text-gray-500">{p.pourquoi}</p> : null}
                {avecProvenance && (p.categorieNom || p.day) ? (
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {[p.categorieNom, p.themeNom, p.day ? dateFr(p.day) : null].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Case libelle="Fournisseur">
                    <span className="inline-flex max-w-[11rem] items-center gap-1.5 truncate">
                      {fiche ? <IconeFournisseur fiche={fiche} /> : null}
                      <span className="truncate">{p.fournisseur && p.fournisseur !== '—' ? p.fournisseur : fiche?.label ?? '—'}</span>
                    </span>
                  </Case>
                  <Case libelle="Prix d'achat">{euros(p.prixAchat)}</Case>
                  <Case libelle="Prix de vente">{euros(p.prixVente)}</Case>
                  <Case
                    libelle="Marge"
                    ton={p.margePct === null ? '' : p.margePct >= 30 ? 'text-emerald-300' : p.margePct < 15 ? 'text-amber-300' : ''}
                  >
                    {p.margePct === null ? '—' : `${Math.round(p.margePct)} %`}
                  </Case>
                  {p.ventes ? <Case libelle="Ventes constatées">{p.ventes}</Case> : null}
                  {p.score != null ? <Case libelle="Score">{`${p.score}/100`}</Case> : null}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-1.5 lg:flex-col lg:items-stretch">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold hover:border-white/30"
                >
                  <ExternalLink size={12} /> Voir sur le web
                </a>
                {parExtension ? (
                  <button
                    type="button"
                    disabled={enCours !== null}
                    onClick={() => versExtension([p], cle, true)}
                    title="Cette page se construit dans le navigateur : la fiche s'ouvre et l'extension l'importe (6 pour l'agent + 12 pour l'import)"
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-purple-400/40 bg-purple-500/20 px-2.5 py-1.5 text-xs font-semibold text-purple-100 hover:border-purple-300/70 disabled:opacity-60"
                  >
                    {enCours === `${cle}:ext` ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Importer extension · {COUT_EXTENSION}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={enCours !== null}
                    onClick={() => importer([p], cle)}
                    className="btn-gradient inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
                  >
                    {enCours === cle ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Importer · {COUT_IMPORT}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
