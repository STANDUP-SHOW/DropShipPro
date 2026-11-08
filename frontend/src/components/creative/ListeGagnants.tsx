import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckSquare, Eye, ExternalLink, Loader2, Lock, Search, Square } from 'lucide-react'
import { COUT_EXTENSION, COUT_IMPORT, importerProduits, type ProduitAffiche } from '../ListeProduitsRapport'
import { Fenetre } from './Creative'
import { dateLongue, liste, lireVerdict, type FamilleVerdict } from './Veille'
import { api } from '../../lib/api'

/**
 * Les produits gagnants des rapports, en LISTE (demande de Max du 08/11/2026).
 *
 * Les cartes de la maquette du 16/10 montraient surtout de mauvaises photos :
 * une ligne par produit, comme Mes annonces, avec une petite miniature, les
 * chiffres en colonnes et un bouton « Importer » au bout. On coche, on importe
 * en lot ; on trie par marge, score, prix ; on filtre par jour, rayon, thème
 * (le type de produit), verdict.
 *
 * Pas de doublon : une fiche dont l'adresse est déjà dans Mes annonces est
 * marquée « Déjà importé » et sort de la sélection. L'import passe par
 * `importerProduits`, le même chemin que la liste des rapports.
 */
type Gagnant = ProduitAffiche & { rapportId: string; day: string; categorie: string; categorieNom: string; theme: string; themeNom: string }

type Tri = 'marge' | 'score' | 'achat' | 'vente' | 'rayon' | 'rang' | 'jour'
const TRIS: ReadonlyArray<{ id: Tri; label: string }> = [
  { id: 'marge', label: 'Plus grosses marges' },
  { id: 'score', label: 'Meilleur score' },
  { id: 'achat', label: "Prix d'achat le plus bas" },
  { id: 'vente', label: 'Prix de vente le plus haut' },
  { id: 'rayon', label: 'Rayon (A → Z)' },
  { id: 'rang', label: 'Rang dans le rapport' },
  { id: 'jour', label: 'Plus récents' },
]

const VERDICTS: ReadonlyArray<{ id: FamilleVerdict | 'tous'; label: string }> = [
  { id: 'tous', label: 'Tous' },
  { id: 'acheter', label: 'Acheter' },
  { id: 'surveiller', label: 'À surveiller' },
  { id: 'non', label: 'Ne pas acheter' },
]

/** Le contrat des agents : 24 rayons, 20 produits par rayon et par jour. */
const ATTENDUS = 24 * 20
const PAGE = 50
const TOUS_LES_JOURS = '*'
const CLE_REGLAGES = 'dsp_gagnants_liste'

const euros = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(2).replace('.', ',')} €`)
const cle = (p: Gagnant) => `${p.rapportId}:${p.rang}`
const dateCourte = (iso: string) => {
  const d = new Date(iso + 'T12:00:00Z')
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}
/** L'adresse comparée sans le superflu : deux écritures d'une même fiche restent un doublon. */
const adresse = (u: string | null | undefined) => (u ?? '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase()

function reglagesSauves(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(CLE_REGLAGES) ?? '{}') ?? {}
  } catch {
    return {}
  }
}

/** Les deux ou trois lettres qui tiennent lieu de miniature quand le rapport n'a pas de photo. */
function initiales(titre: string): string {
  const mots = titre.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((m) => m.length > 2)
  return (mots.slice(0, 2).map((m) => m[0]).join('') || '?').toUpperCase()
}

function Miniature({ p }: { p: Gagnant }) {
  const [rate, setRate] = useState(false)
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/30 text-[11px] font-bold text-[var(--c-texte-2)]">
      {p.image && !rate ? (
        <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setRate(true)} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden>{initiales(p.titre)}</span>
      )}
    </div>
  )
}

function PastilleVerdict({ brut }: { brut: string | null | undefined }) {
  const v = lireVerdict(brut)
  if (!v) return <span className="text-xs text-gray-500">—</span>
  const ton =
    v.famille === 'acheter'
      ? 'bg-emerald-500/15 text-emerald-300'
      : v.famille === 'non'
        ? 'bg-red-500/15 text-red-300'
        : 'bg-amber-500/15 text-amber-200'
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${ton}`}>{v.libelle}</span>
}

function Marge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-gray-500">—</span>
  const ton = pct >= 100 ? 'bg-emerald-500/20 text-emerald-300' : pct >= 40 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-white/10 text-gray-300'
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold ${ton}`}>{`${Math.round(pct)} %`}</span>
}

export function ListeGagnants() {
  const sauve = reglagesSauves()
  const [produits, setProduits] = useState<Gagnant[]>([])
  const [jours, setJours] = useState<string[]>([])
  const [jour, setJour] = useState<string>('')
  const [categorie, setCategorie] = useState<string>(sauve.categorie ?? '')
  const [theme, setTheme] = useState<string>(sauve.theme ?? '')
  const [famille, setFamille] = useState<FamilleVerdict | 'tous'>((sauve.famille as FamilleVerdict) ?? 'tous')
  const [tri, setTri] = useState<Tri>((sauve.tri as Tri) ?? 'marge')
  const [recherche, setRecherche] = useState<string>(sauve.recherche ?? '')
  const [masquerImportes, setMasquerImportes] = useState<boolean>(sauve.masquer === '1')
  const [montres, setMontres] = useState(PAGE)
  const [coches, setCoches] = useState<Set<string>>(new Set())
  const [dejaLa, setDejaLa] = useState<Set<string>>(new Set())
  const [examine, setExamine] = useState<Gagnant | null>(null)
  const [chargement, setChargement] = useState(true)
  const [enCours, setEnCours] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [porte, setPorte] = useState<{ seuil: number; drops: number } | null>(null)

  // Le jour choisi est relu au serveur ; « tous les jours » prend ce qu'il garde.
  useEffect(() => {
    setChargement(true)
    setErreur(null)
    const tous = jour === TOUS_LES_JOURS
    api
      .gagnantsRapports({ jour: jour && !tous ? jour : undefined, limite: 1000 })
      .then((d) => {
        setProduits(liste<Gagnant>(d?.produits))
        if (!jour || tous) setJours(liste<string>(d?.jours))
      })
      .catch((e: Error & { status?: number; body?: { seuil?: number; drops?: number } }) => {
        setProduits([])
        if (e.status === 402) setPorte({ seuil: e.body?.seuil ?? 500, drops: e.body?.drops ?? 0 })
        else setErreur(e.message)
      })
      .finally(() => setChargement(false))
  }, [jour])

  // Ce qui est déjà dans Mes annonces : pas d'import en double.
  function relireAnnonces() {
    api
      .listProducts()
      .then((l) => setDejaLa(new Set((Array.isArray(l) ? l : []).map((p: { sourceUrl?: string }) => adresse(p.sourceUrl)).filter(Boolean))))
      .catch(() => undefined)
  }
  useEffect(relireAnnonces, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(
        CLE_REGLAGES,
        JSON.stringify({ categorie, theme, famille, tri, recherche, masquer: masquerImportes ? '1' : '' }),
      )
    } catch {
      /* sessionStorage unavailable: settings are simply not kept */
    }
  }, [categorie, theme, famille, tri, recherche, masquerImportes])

  const tousLesJours = jour === TOUS_LES_JOURS
  // Sans jour choisi, le plus récent : « tous les jours » mélange les éditions, exprès.
  const jourMontre = tousLesJours ? '' : jour || jours[0] || ''
  const estImporte = (p: Gagnant) => dejaLa.has(adresse(p.url))

  const duJour = useMemo(() => produits.filter((p) => !jourMontre || p.day === jourMontre), [produits, jourMontre])
  const rayons = useMemo(() => {
    const vus = new Map<string, string>()
    for (const p of duJour) vus.set(p.categorie, p.categorieNom)
    return [...vus.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fr'))
  }, [duJour])
  const duRayon = useMemo(() => duJour.filter((p) => !categorie || p.categorie === categorie), [duJour, categorie])
  const themes = useMemo(() => {
    const vus = new Map<string, string>()
    for (const p of duRayon) if (p.themeNom) vus.set(p.themeNom, p.themeNom)
    return [...vus.keys()].sort((a, b) => a.localeCompare(b, 'fr'))
  }, [duRayon])

  const aiguille = recherche.trim().toLowerCase()
  const avantVerdict = duRayon.filter(
    (p) =>
      (!theme || p.themeNom === theme) &&
      (!masquerImportes || !estImporte(p)) &&
      (!aiguille || `${p.titre} ${p.fournisseur} ${p.categorieNom} ${p.themeNom}`.toLowerCase().includes(aiguille)),
  )
  const filtres = avantVerdict.filter((p) => famille === 'tous' || lireVerdict(p.verdict)?.famille === famille)

  const tries = useMemo(() => {
    const bas = (n: number | null | undefined) => (n == null ? Number.POSITIVE_INFINITY : n)
    const haut = (n: number | null | undefined) => (n == null ? Number.NEGATIVE_INFINITY : n)
    return [...filtres].sort((a, b) => {
      switch (tri) {
        case 'marge':
          return haut(b.margePct) - haut(a.margePct)
        case 'score':
          return haut(b.score) - haut(a.score)
        case 'achat':
          return bas(a.prixAchat) - bas(b.prixAchat)
        case 'vente':
          return haut(b.prixVente) - haut(a.prixVente)
        case 'rayon':
          return a.categorieNom.localeCompare(b.categorieNom, 'fr') || a.rang - b.rang
        case 'jour':
          return b.day.localeCompare(a.day) || a.rang - b.rang
        default:
          return a.rang - b.rang || a.categorieNom.localeCompare(b.categorieNom, 'fr')
      }
    })
  }, [filtres, tri])

  const visibles = tries.slice(0, montres)
  const selectionnables = visibles.filter((p) => !estImporte(p))
  const selection = tries.filter((p) => coches.has(cle(p)) && !estImporte(p))
  const toutCoche = selectionnables.length > 0 && selectionnables.every((p) => coches.has(cle(p)))
  const cout = (lot: Gagnant[]) => lot.reduce((t, p) => t + (p.import === 'extension' ? COUT_EXTENSION : COUT_IMPORT), 0)
  const nombreDe = (f: FamilleVerdict | 'tous') =>
    f === 'tous' ? avantVerdict.length : avantVerdict.filter((p) => lireVerdict(p.verdict)?.famille === f).length
  const importesDuJour = duJour.filter(estImporte).length
  const marges = duJour.map((p) => p.margePct).filter((m): m is number => m != null)
  const margeMediane = marges.length ? [...marges].sort((a, b) => a - b)[Math.floor(marges.length / 2)] : null

  function reinitialiserVue() {
    setMontres(PAGE)
    setCoches(new Set())
  }

  function basculer(p: Gagnant) {
    setCoches((c) => {
      const s = new Set(c)
      if (s.has(cle(p))) s.delete(cle(p))
      else s.add(cle(p))
      return s
    })
  }

  function basculerTout() {
    setCoches((c) => {
      const s = new Set(c)
      for (const p of selectionnables) {
        if (toutCoche) s.delete(cle(p))
        else s.add(cle(p))
      }
      return s
    })
  }

  async function importer(lot: Gagnant[], quoi: string) {
    const aFaire = lot.filter((p) => !estImporte(p))
    if (!aFaire.length) return
    setEnCours(quoi)
    setMessage(null)
    try {
      setMessage(await importerProduits(aFaire, 'gagnants'))
      setCoches((c) => {
        const s = new Set(c)
        for (const p of aFaire) s.delete(cle(p))
        return s
      })
      relireAnnonces()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "L'import n'a pas abouti.")
    } finally {
      setEnCours(null)
    }
  }

  if (porte) {
    return (
      <div className="v-carte mt-8 max-w-2xl">
        <p className="flex items-center gap-2 font-bold">
          <Lock size={16} /> Réservé aux comptes à {porte.seuil} drops et plus
        </p>
        <p className="mt-2 text-sm text-[var(--c-texte-2)]">
          Les produits gagnants sont offerts, mais il vous faut {porte.seuil} drops en banque : vous en avez {porte.drops}.
        </p>
        <Link to="/credits" className="c-bouton mt-4 w-fit">Recharger mes drops</Link>
      </div>
    )
  }

  const chiffres: Array<[string | number, string]> = [
    [duJour.length, jourMontre ? `relevés le ${dateLongue(jourMontre)}` : 'relevés sur les jours chargés'],
    [rayons.length, `rayon${rayons.length > 1 ? 's' : ''} sur 24`],
    [margeMediane == null ? '—' : `${Math.round(margeMediane)} %`, 'marge médiane affichée'],
    [importesDuJour, 'déjà dans Mes annonces'],
  ]

  return (
    <>
      {/* ---------- Bloc stats réduit ---------- */}
      <section className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {chiffres.map(([n, libelle]) => (
          <div key={libelle} className="rounded-xl border border-white/10 bg-[#191E2E] px-3 py-2.5">
            <p className="text-xl font-bold leading-none">{n}</p>
            <p className="mt-1 text-[11px] text-[var(--c-texte-2)]">{libelle}</p>
          </div>
        ))}
      </section>
      <p className="mt-2 text-[11px] text-[var(--c-texte-2)]">{`Chaque matin, ${ATTENDUS} produits attendus : 24 rayons × 20.`}</p>

      {/* ---------- Tris et filtres ---------- */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            className="c-champ !pl-8"
            placeholder="Chercher un produit, un fournisseur…"
            value={recherche}
            onChange={(e) => { setRecherche(e.target.value); reinitialiserVue() }}
            aria-label="Chercher"
          />
        </label>
        <select className="c-champ !w-auto" value={jour || jours[0] || ''} onChange={(e) => { setJour(e.target.value); setCategorie(''); setTheme(''); reinitialiserVue() }} aria-label="Jour">
          {jours.map((j) => (
            <option key={j} value={j}>{dateLongue(j)}</option>
          ))}
          {jours.length > 1 ? <option value={TOUS_LES_JOURS}>Tous les jours</option> : null}
        </select>
        <select className="c-champ !w-auto" value={categorie} onChange={(e) => { setCategorie(e.target.value); setTheme(''); reinitialiserVue() }} aria-label="Rayon">
          <option value="">Tous les rayons</option>
          {rayons.map(([id, nom]) => (
            <option key={id} value={id}>{nom}</option>
          ))}
        </select>
        <select className="c-champ !w-auto" value={theme} onChange={(e) => { setTheme(e.target.value); reinitialiserVue() }} aria-label="Type de produit">
          <option value="">Tous les types de produit</option>
          {themes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select className="c-champ !w-auto" value={tri} onChange={(e) => setTri(e.target.value as Tri)} aria-label="Trier">
          {TRIS.map((t) => (
            <option key={t.id} value={t.id}>{`Trier : ${t.label}`}</option>
          ))}
        </select>
      </div>

      {/* Le verdict, en un seul bloc de boutons groupés, comme les états de Mes annonces. */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filtrer par verdict" className="inline-flex max-w-full flex-wrap overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
          {VERDICTS.map((v) => {
            const actif = famille === v.id
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={actif}
                onClick={() => { setFamille(v.id); reinitialiserVue() }}
                className={`border-r border-white/10 px-3.5 py-2 text-sm font-semibold transition last:border-r-0 ${
                  actif ? 'bg-gradient-to-r from-[#f28a4b] to-[#e85290] text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>{v.label}</span>
                <span className={`ml-1.5 text-xs ${actif ? 'text-white/80' : 'text-gray-500'}`}>{nombreDe(v.id)}</span>
              </button>
            )
          })}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--c-texte-2)]">
          <input type="checkbox" checked={masquerImportes} onChange={(e) => { setMasquerImportes(e.target.checked); reinitialiserVue() }} />
          Masquer les produits déjà importés
        </label>
      </div>

      {/* ---------- Barre de sélection ---------- */}
      {tries.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <div className="flex items-center gap-3">
            <button type="button" onClick={basculerTout} disabled={!selectionnables.length} className="flex items-center gap-2 text-sm text-gray-300 hover:text-white disabled:opacity-40">
              {toutCoche ? <CheckSquare size={15} className="text-[#E85290]" /> : <Square size={15} />}
              <span>{toutCoche ? 'Tout désélectionner' : 'Tout sélectionner'}</span>
            </button>
            <span className="text-xs text-gray-400">{`${selection.length} sélectionné${selection.length > 1 ? 's' : ''} · ${tries.length} produit${tries.length > 1 ? 's' : ''}`}</span>
          </div>
          <button type="button" className="c-bouton !py-2 !text-sm" disabled={!selection.length || enCours !== null} onClick={() => importer(selection, 'lot')}>
            {enCours === 'lot' ? <Loader2 size={14} className="animate-spin" /> : null}
            <span>{selection.length ? `Importer la sélection (${selection.length}) · ${cout(selection)} drops` : 'Importer la sélection'}</span>
          </button>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-sm text-[var(--c-lime)]">{message}</p> : null}

      {/* ---------- La liste ---------- */}
      {erreur ? <p className="mt-4 text-sm text-red-400">{erreur}</p> : null}
      {chargement ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-[var(--c-texte-2)]"><Loader2 size={14} className="animate-spin" /> Chargement…</p>
      ) : tries.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-[var(--c-texte-2)]">
          {duJour.length ? 'Aucun produit ne répond à ces filtres.' : "Aucun produit gagnant déposé pour l'instant. Les agents en déposent vingt par rayon et par jour, le matin."}
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-white/5">
          {/* En-têtes de colonnes, sur grand écran seulement. */}
          <div className="hidden items-center gap-3 border-b border-white/10 px-3 py-2 text-[10px] uppercase tracking-wide text-gray-500 lg:flex">
            <span className="w-[18px]" />
            <span className="w-11" />
            <span className="flex-1">Produit</span>
            <span className="w-28">Verdict</span>
            <span className="w-20 text-right">Achat</span>
            <span className="w-20 text-right">Vente</span>
            <span className="w-16 text-right">Marge</span>
            <span className="w-12 text-right">Score</span>
            <span className="w-[236px]" />
          </div>
          <div className="divide-y divide-white/5">
            {visibles.map((p) => {
              const importe = estImporte(p)
              const coche = coches.has(cle(p)) && !importe
              const prix = p.import === 'extension' ? COUT_EXTENSION : COUT_IMPORT
              return (
                <div key={cle(p)} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 transition lg:flex-nowrap ${coche ? 'bg-[#E85290]/10' : 'hover:bg-white/[0.03]'}`}>
                  <button
                    type="button"
                    aria-pressed={coche}
                    aria-label={`Sélectionner ${p.titre}`}
                    title={importe ? 'Déjà dans Mes annonces' : 'Sélectionner pour un import en lot'}
                    disabled={importe}
                    onClick={() => basculer(p)}
                    className={`${coche ? 'text-[#E85290]' : 'text-gray-500 hover:text-gray-300'} disabled:opacity-30`}
                  >
                    {coche ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                  <Miniature p={p} />
                  <button type="button" onClick={() => setExamine(p)} className="min-w-0 flex-1 basis-[calc(100%-6.5rem)] text-left lg:basis-0" title={p.titre}>
                    <p className="truncate text-sm font-medium hover:underline">{p.titre}</p>
                    <p className="truncate text-[11px] text-[var(--c-texte-2)]">
                      {[p.categorieNom, p.themeNom, p.fournisseur && p.fournisseur !== '—' ? p.fournisseur : null, tousLesJours ? dateCourte(p.day) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </button>
                  <span className="shrink-0 lg:w-28"><PastilleVerdict brut={p.verdict} /></span>
                  <span className="shrink-0 text-sm text-gray-300 lg:w-20 lg:text-right" title="Prix d'achat repris du rapport">{euros(p.prixAchat)}</span>
                  <span className="shrink-0 text-sm font-semibold text-emerald-300 lg:w-20 lg:text-right" title="Prix de vente indiqué">{euros(p.prixVente)}</span>
                  <span className="shrink-0 text-sm lg:w-16 lg:text-right"><Marge pct={p.margePct} /></span>
                  <span className="shrink-0 text-xs text-[var(--c-texte-2)] lg:w-12 lg:text-right" title="Score de l'agent sur 100">{p.score == null ? '—' : <><span className="lg:hidden">Score </span>{p.score}</>}</span>
                  <div className="flex w-full shrink-0 items-center justify-end gap-1 lg:w-[236px]">
                    <button type="button" onClick={() => setExamine(p)} title="Examiner" aria-label={`Examiner ${p.titre}`} className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white">
                      <Eye size={15} />
                    </button>
                    <a href={p.url} target="_blank" rel="noopener noreferrer" title="Voir la fiche source" aria-label={`Fiche source de ${p.titre}`} className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white">
                      <ExternalLink size={15} />
                    </a>
                    {importe ? (
                      <span className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[var(--c-texte-2)]">Déjà importé</span>
                    ) : (
                      <button
                        type="button"
                        disabled={enCours !== null}
                        onClick={() => importer([p], cle(p))}
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${
                          p.import === 'extension' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-gradient-to-r from-[#f28a4b] to-[#e85290] hover:opacity-90'
                        }`}
                        title={p.import === 'extension' ? "La fiche ne se lit que dans un navigateur : elle part à l'extension" : 'Import direct'}
                      >
                        {enCours === cle(p) ? <Loader2 size={12} className="animate-spin" /> : null}
                        {`${p.import === 'extension' ? 'Importer extension' : 'Importer'} · ${prix}`}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {tries.length > montres ? (
            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-white/10 px-3 py-3">
              <button type="button" className="c-bouton-sec !text-xs" onClick={() => setMontres((n) => n + PAGE)}>
                {`Voir ${Math.min(PAGE, tries.length - montres)} de plus`}
              </button>
              <button type="button" className="c-bouton-sec !text-xs" onClick={() => setMontres(tries.length)}>
                {`Tout afficher (${tries.length})`}
              </button>
            </div>
          ) : null}
        </div>
      )}

      <p className="v-note mt-6">
        {`Prix et marges repris du rapport, à reconfirmer avant import. La marge affichée n'est pas un bénéfice net. Import direct : ${COUT_IMPORT} drops ; par l'extension, quand la fiche ne se lit que dans un navigateur : ${COUT_EXTENSION} drops. Un produit déjà dans Mes annonces n'est pas réimporté.`}
      </p>

      {examine ? (
        <Fenetre titre={examine.titre} onClose={() => setExamine(null)}>
          <div className="mt-2"><PastilleVerdict brut={examine.verdict} /></div>
          <p className="mt-3 text-xs text-[var(--c-texte-2)]">
            {[`Rapport ${examine.categorieNom}`, examine.themeNom, dateLongue(examine.day), examine.fournisseur && examine.fournisseur !== '—' ? examine.fournisseur : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="v-trois mt-4">
            <p><small>Achat</small><b>{euros(examine.prixAchat)}</b></p>
            <p><small>Vente indiquée</small><b>{euros(examine.prixVente)}</b></p>
            <p><small>Marge affichée</small><b>{examine.margePct == null ? '—' : `${Math.round(examine.margePct)} %`}</b></p>
          </div>
          {examine.pourquoi && examine.pourquoi !== '—' ? <p className="mt-4 text-sm leading-relaxed">{examine.pourquoi}</p> : null}
          <p className="mt-3 text-xs text-[var(--c-texte-2)]">
            {[examine.ventes ? `Ventes constatées : ${examine.ventes}` : null, examine.score != null ? `Score de l'agent : ${examine.score}/100` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={examine.url} target="_blank" rel="noopener noreferrer" className="c-bouton-sec !text-xs">
              <ExternalLink size={12} /> Consulter la référence source
            </a>
            {estImporte(examine) ? (
              <span className="c-bouton-sec !text-xs opacity-70">Déjà dans Mes annonces</span>
            ) : (
              <button type="button" className="c-bouton !text-xs" disabled={enCours !== null} onClick={() => importer([examine], cle(examine))}>
                {`Importer · ${examine.import === 'extension' ? COUT_EXTENSION : COUT_IMPORT} drops`}
              </button>
            )}
          </div>
          {message ? <p className="mt-3 text-xs text-[var(--c-lime)]">{message}</p> : null}
        </Fenetre>
      ) : null}
    </>
  )
}
