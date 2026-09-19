import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Download, Send, Loader2, CheckSquare, Square } from 'lucide-react'
import { api, type ProduitRapport } from '../lib/api'

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
  const [liens, setLiens] = useState<Array<{ supplier: string; connected: boolean }>>([])
  const [fournisseurs, setFournisseurs] = useState<Array<{ id: string; name: string }>>([])
  const [enCours, setEnCours] = useState<string | null>(null)
  const [coches, setCoches] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    api.listSupplierLinks().then(setLiens).catch(() => undefined)
    api
      .listSuppliers()
      .then((s) => setFournisseurs((s as Array<{ id: string; label: string }>).map((x) => ({ id: x.id, name: x.label }))))
      .catch(() => undefined)
  }, [])

  function dire(texte: string | null) {
    setMessage(texte)
    onMessage?.(texte)
  }

  /** Le fournisseur d'une ligne, retrouvé par son nom dans l'annuaire — et s'il est relié. */
  function fournisseurDe(p: ProduitAffiche) {
    const nom = p.fournisseur.toLowerCase()
    const f = fournisseurs.find(
      (x) => x.name.toLowerCase() === nom || nom.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(nom),
    )
    const relie = f ? liens.some((l) => l.supplier === f.id && l.connected) : false
    return { id: f?.id ?? null, relie }
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
      dire(morceaux.length ? `${morceaux.join(' · ')}.` : 'Rien à faire : tout était déjà importé ou en file.')
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
   * — l'extension les relève au fur et à mesure de sa navigation.
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
            ? "La fiche s'ouvre dans un onglet : l'extension la relève pendant qu'elle est affichée."
            : 'Ouvrez les fiches dans votre navigateur, l\'extension les relève au passage.'),
      )
    } catch (e) {
      dire(e instanceof Error ? e.message : "L'envoi n'a pas abouti.")
    } finally {
      setEnCours(null)
    }
  }

  const directs = produits.filter((p) => p.import !== 'extension').length

  if (!produits.length) return null

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span>
          {produits.length} produits — {directs} importables directement, {produits.length - directs} par l'extension.
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {avecSelection && coches.size > 0 ? (
            <>
              <button
                type="button"
                disabled={enCours !== null}
                onClick={() => importer(selection, 'selection')}
                className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                {enCours === 'selection' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                {`Importer la sélection (${coches.size})`}
              </button>
              <button
                type="button"
                disabled={enCours !== null}
                onClick={() => versExtension(selection, 'selection', false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-purple-400/30 bg-purple-400/10 px-3 py-1.5 text-xs font-semibold text-purple-100 hover:border-purple-400/60 disabled:opacity-60"
              >
                {enCours === 'selection:ext' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                Importer avec l'extension
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={enCours !== null}
                onClick={() => importer(produits, origine)}
                className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
              >
                {enCours === origine ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Tout importer
              </button>
              <button
                type="button"
                disabled={enCours !== null}
                onClick={() => versExtension(produits, origine, false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:border-purple-400/50 disabled:opacity-60"
              >
                {enCours === `${origine}:ext` ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Tout envoyer à
                l'extension
              </button>
            </>
          )}
        </span>
      </div>

      {message ? (
        <p className="mt-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">{message}</p>
      ) : null}

      <ul className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10">
        {produits.map((p) => {
          const f = fournisseurDe(p)
          const cle = `${p.rapportId ?? origine}:${p.rang}`
          const coche = coches.has(cleDe(p))
          return (
            <li key={`${p.url}-${p.rang}`} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
              {avecSelection ? (
                <button
                  type="button"
                  onClick={() => basculer(p)}
                  title="Cocher pour importer en lot"
                  className="shrink-0 self-start text-gray-400 hover:text-white md:self-center"
                >
                  {coche ? <CheckSquare size={16} className="text-emerald-400" /> : <Square size={16} />}
                </button>
              ) : null}

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  <span className="text-gray-500">{p.rang}.</span> {p.titre}
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {p.fournisseur}
                  {f.relie ? (
                    <span className="ml-1 rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300">relié</span>
                  ) : null}
                  {' · '}achat {euros(p.prixAchat)} · vente {euros(p.prixVente)}
                  {p.margePct !== null ? ` · marge ${Math.round(p.margePct)} %` : ''}
                  {p.pourquoi ? <span className="text-gray-500"> — {p.pourquoi}</span> : null}
                </p>
                {avecProvenance && (p.categorieNom || p.day) ? (
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {[p.categorieNom, p.themeNom, p.day ? dateFr(p.day) : null].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 flex-wrap gap-1.5">
                {f.relie && f.id ? (
                  <Link
                    to={`/catalogues?fournisseur=${encodeURIComponent(f.id)}&q=${encodeURIComponent(p.titre)}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold hover:border-purple-400/50"
                  >
                    <ExternalLink size={12} /> Voir chez nous
                  </Link>
                ) : (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold hover:border-purple-400/50"
                  >
                    <ExternalLink size={12} /> Voir sur le web
                  </a>
                )}
                {p.import !== 'extension' ? (
                  <button
                    type="button"
                    disabled={enCours !== null}
                    onClick={() => importer([p], cle)}
                    className="btn-gradient inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
                  >
                    {enCours === cle ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Importer · 12
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={enCours !== null}
                  onClick={() => versExtension([p], cle, true)}
                  title="Ouvre la fiche et la confie à l'agent extension"
                  className="inline-flex items-center gap-1 rounded-lg border border-purple-400/30 bg-purple-400/10 px-2.5 py-1.5 text-xs font-semibold text-purple-100 hover:border-purple-400/60 disabled:opacity-60"
                >
                  {enCours === `${cle}:ext` ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Extension · 6 + 12
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
