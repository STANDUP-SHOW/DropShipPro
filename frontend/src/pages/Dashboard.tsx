import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Link2, Loader2, Layers, Puzzle, Trash2, Copy, LayoutGrid, List, Radio, CheckSquare, Square, TrendingUp } from 'lucide-react'
import { Layout } from '../components/Layout'
import { CategoryMenu } from '../components/CategoryMenu'
import { AgentBar } from '../components/AgentBar'
import { VoirPlus, useVoirPlus } from '../components/VoirPlus'
import { BulkPublishDialog } from '../components/BulkPublishDialog'
import { BulkActions } from '../components/BulkActions'
import { api, assetUrl, importSupplierList } from '../lib/api'
import type { PlatformInfo } from '../lib/platforms'
import { PublishedBadges } from '../components/PublishedBadges'

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon',
  READY: 'Prêt',
  PUBLISHED: 'Publié',
  ARCHIVED: 'Archivé',
}
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-gray-500/20 text-gray-300',
  READY: 'bg-blue-500/20 text-blue-300',
  PUBLISHED: 'bg-emerald-500/20 text-emerald-300',
  ARCHIVED: 'bg-gray-500/20 text-gray-400',
}

export default function Dashboard() {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [url, setUrl] = useState('')
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchUrls, setBatchUrls] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [batchSummary, setBatchSummary] = useState<string | null>(null)
  /** Le détail des échecs, adresse par adresse — le serveur le donnait déjà, personne ne l'affichait. */
  const [batchEchecs, setBatchEchecs] = useState<Array<{ url: string; error: string }>>([])
  /** Le compte-rendu d'une action en lot. Une action muette laisse croire qu'il ne s'est rien passé. */
  const [avis, setAvis] = useState<string | null>(null)
  const [tri, setTri] = useState<'date' | 'categorie' | 'prix' | 'fournisseur'>('date')
  const [statut, setStatut] = useState<'tous' | 'publie' | 'nonPublie'>('tous')
  const [fournisseurFiltre, setFournisseurFiltre] = useState('')
  /**
   * N'afficher que les annonces dont le texte n'a pas été réécrit.
   *
   * `aiEnhanced` vaut faux quand le modèle n'a pas répondu : l'annonce garde
   * alors le texte du fournisseur, et rien ne la distinguait des autres. Le
   * 02/09/2026, vingt-deux annonces sur vingt-cinq étaient dans ce cas et il a
   * fallu les ouvrir une par une pour s'en apercevoir.
   */
  const [seulementNonReecrites, setSeulementNonReecrites] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  /** Les identifiants que le choix de catégorie recouvre. Vide = toutes. */
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<any>(null)
  const [deleting, setDeleting] = useState(false)

  // Kept between visits: someone who works in list mode expects to find it again.
  const [view, setView] = useState<'grid' | 'list'>(
    () => (localStorage.getItem('droppost_view') === 'list' ? 'list' : 'grid'),
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [platforms, setPlatforms] = useState<PlatformInfo[]>([])
  const navigate = useNavigate()


  /*
   * Ce que le menu doit savoir : quelles categories existent au catalogue, et
   * combien d annonces chacune porte.
   *
   * Calcule ici plutot que dans le menu : lui donner la liste des annonces
   * l obligerait a connaitre leur forme, et il ne sert pas qu a cet ecran.
   */
  const presentsCategories = [...new Set(products.map((p) => p.categoryId).filter(Boolean))] as string[]
  const comptePar = new Map<string, number>()
  for (const p of products) {
    if (p.categoryId) comptePar.set(p.categoryId, (comptePar.get(p.categoryId) ?? 0) + 1)
  }


  /*
   * Les fournisseurs présents, tirés des annonces elles-mêmes.
   *
   * Pas d'une liste écrite à la main : le vendeur importe d'où il veut, et une
   * liste figée proposerait des sources qu'il n'utilise pas tout en oubliant
   * celles qu'il utilise.
   */
  const fournisseurs = [...new Set(products.map((p) => p.sourceSite).filter(Boolean))].sort() as string[]

  /** Combien d'annonces portent encore le texte du fournisseur. */
  const nonReecrites = products.filter((p) => p.aiEnhanced === false).length

  const needle = search.trim().toLowerCase()
  const filtres = products
    /*
     * Le filtre porte sur ce que le choix recouvre, pas sur un seul identifiant.
     *
     * Comparer `p.categoryId === categoryFilter` marchait pour une
     * sous-catégorie et jamais pour un rayon : une annonce est rangée dans
     * « Électronique › Écouteurs », pas dans « Électronique ». Le menu
     * annonçait vingt annonces, la liste en affichait zéro, et il fallait
     * entrer dans une sous-catégorie pour voir quoi que ce soit.
     */
    .filter((p) => !categoryIds.length || categoryIds.includes(p.categoryId))
    .filter((p) => !needle || `${p.aiTitle ?? ''} ${p.title ?? ''}`.toLowerCase().includes(needle))
    .filter((p) => !fournisseurFiltre || p.sourceSite === fournisseurFiltre)
    .filter((p) => !seulementNonReecrites || p.aiEnhanced === false)
    .filter((p) => {
      if (statut === 'tous') return true
      const publiee = (p.publications ?? []).length > 0
      return statut === 'publie' ? publiee : !publiee
    })
    /*
     * Trié sur une copie, jamais sur `products`.
     *
     * `Array.sort` trie en place : appliqué au tableau d'état, il le réordonne
     * sans que React s'en aperçoive, et l'ordre change alors sous les autres
     * écrans qui lisent la même liste. Les `.filter` ci-dessus rendent déjà une
     * copie, mais s'y fier tient à leur présence — ce qui ne se voit pas.
     */
    .slice()
    .sort((a, b) => {
      switch (tri) {
        case 'prix':
          return Number(b.sellingPrice ?? 0) - Number(a.sellingPrice ?? 0)
        case 'categorie':
          // Sans catégorie en dernier : ce sont celles à reprendre, et les
          // noyer au milieu de l'alphabet revient à ne pas les signaler.
          return (a.categoryId ? 0 : 1) - (b.categoryId ? 0 : 1) ||
            String(a.categoryId ?? '').localeCompare(String(b.categoryId ?? ''))
        case 'fournisseur':
          return String(a.sourceSite ?? '').localeCompare(String(b.sourceSite ?? ''))
        default:
          return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      }
    })

  /*
   * Dix d'abord, la suite a la demande.
   *
   * Trois cents annonces d un coup ne se parcourent pas -- on fait defiler en
   * esperant reconnaitre un titre, et le navigateur peine sur autant de photos.
   * `visible` reste le nom lu partout ailleurs dans cette page : la selection
   * en lot et les compteurs portent sur ce qui est a l ecran.
   */
  const { visibles: visible, reste, plus, tout } = useVoirPlus(filtres)

  async function load() {
    setLoading(true)
    try {
      const list = await api.listProducts()
      setProducts(list)
      // A listing deleted from another tab must not stay in the selection and
      // make the batch endpoint answer « annonce introuvable ».
      setSelectedIds((current) => current.filter((id) => list.some((p: any) => p.id === id)))
    } finally {
      setLoading(false)
    }
  }

  /**
   * Dupliquer une annonce, sans repasser par un import.
   *
   * Ce que ça évite : refaire une capture — donc repayer un crédit et rouvrir
   * la fiche du fournisseur — pour vendre le même produit dans un second
   * coloris, sur une seconde boutique, ou pour garder l'original avant de
   * tailler dedans.
   *
   * La copie naît en brouillon et n'hérite d'aucune publication : reprendre
   * l'état « Publié » ferait croire à une annonce en ligne qu'aucune place de
   * marché ne connaît.
   */
  const [duplication, setDuplication] = useState<string | null>(null)

  async function dupliquer(p: any) {
    setDuplication(p.id)
    setError(null)
    try {
      const copie = await api.dupliquerProduit(p.id)
      setAvis(`Copie créée : « ${copie.aiTitle ?? 'Annonce'} ». Aucun crédit — rien n'a été réécrit.`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Duplication impossible')
    } finally {
      setDuplication(null)
    }
  }

  useEffect(() => {
    load()
    api.listPlatforms().then(setPlatforms)
  }, [])

  useEffect(() => {
    localStorage.setItem('droppost_view', view)
  }, [view])

  function toggleSelected(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))
  }

  // Selecting acts on what is on screen, not on the whole catalogue: a filter is
  // there precisely to narrow what the next action will touch.
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selectedIds.includes(p.id))
  function toggleAllVisible() {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        const ids = new Set(visible.map((p) => p.id))
        return current.filter((id) => !ids.has(id))
      }
      return [...new Set([...current, ...visible.map((p) => p.id)])]
    })
  }

  async function onImport(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setImporting(true)
    try {
      await api.importProduct(url)
      setUrl('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'import")
    } finally {
      setImporting(false)
    }
  }

  /**
   * L'import en lot, une adresse par requête.
   *
   * **Deux défauts, et le second faisait tout échouer.**
   *
   * Le premier : le serveur rendait une erreur *par adresse*, et l'écran n'en
   * affichait aucune — « 0 importés, 25 échoués » sans dire pourquoi, ce qui ne
   * laisse rien à corriger.
   *
   * Le second : les vingt-cinq adresses partaient dans **une seule requête**.
   * Un import prend trente à soixante secondes ; vingt-cinq à la suite font un
   * quart d'heure, et aucun proxy ne tient une requête ouverte aussi longtemps.
   * La connexion tombait donc systématiquement — « failed to fetch » — alors
   * que le serveur, lui, continuait d'importer. Exactement la panne du bouton
   * « Reprendre », découverte quinze jours plus tôt et corrigée de la même
   * façon : découper côté client.
   *
   * Une adresse par requête tient largement dans le délai, montre l'avancement
   * pendant que ça tourne, et rend chaque échec lisible avec son adresse.
   */
  async function onBatchImport(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBatchSummary(null)
    setBatchEchecs([])
    const urls = batchUrls
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, 25)
    if (!urls.length) return

    setImporting(true)
    const echecs: Array<{ url: string; error: string }> = []
    let reussies = 0

    for (const [i, u] of urls.entries()) {
      setBatchSummary(`Import ${i + 1} sur ${urls.length}…`)
      try {
        const res = await api.importBatch([u])
        const ligne = res.results[0]
        if (ligne?.ok) reussies++
        else echecs.push({ url: u, error: ligne?.error || 'Échec sans détail' })
      } catch (err) {
        /*
         * Une adresse qui échoue n'arrête pas le lot.
         *
         * Un solde épuisé, lui, l'arrête : les suivantes échoueraient toutes
         * pour la même raison, et vingt-quatre lignes rouges identiques
         * cachent la seule qui compte.
         */
        const message = err instanceof Error ? err.message : "Échec de l'import"
        echecs.push({ url: u, error: message })
        if (/crédit|credit|solde/i.test(message)) {
          setBatchSummary(`Arrêté à ${i + 1} sur ${urls.length} : ${message}`)
          break
        }
      }
      // Rechargée au fur et à mesure : le vendeur voit ses annonces arriver au
      // lieu d'attendre devant une liste inchangée.
      await load()
    }

    setBatchEchecs(echecs)
    setBatchSummary(`${reussies} importée(s), ${echecs.length} en échec sur ${urls.length}.`)
    // Seules les adresses en échec restent dans le champ : le vendeur corrige
    // et relance sans retrier à la main celles qui sont déjà passées.
    setBatchUrls(echecs.map((e) => e.url).join('\n'))
    setImporting(false)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.deleteProduct(pendingDelete.id)
      setSelectedIds((current) => current.filter((id) => id !== pendingDelete.id))
      setPendingDelete(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Layout>
      {/* L'agent en charge de ce qui se decide ici : une question posee devant
          l ecran ne devrait pas obliger a quitter l ecran. */}
      <AgentBar
        agentKey="writer"
        nom="Romain"
        emoji="✍️"
        exemple="Demandez à Romain : réécris ce titre pour Leboncoin, il est trop long."
      />
      {/* Deleting a listing can't be undone, so it goes through a confirmation
          rather than firing on the thumbnail click. */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1b1633] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-bold">Supprimer cette annonce ?</h2>
            <p className="mt-2 text-sm text-gray-300 line-clamp-2">
              {pendingDelete.aiTitle || pendingDelete.title}
            </p>
            <p className="mt-2 text-xs text-gray-500">
              L'annonce et ses photos filigranées seront définitivement effacées.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="rounded-lg bg-red-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Importer un produit</h1>
          <p className="text-gray-400 text-sm mt-1">Collez l'URL d'un produit — Temu, JoyBuy, ou n'importe quel site.</p>
        </div>
        <a
          href={assetUrl('/api/public/extension.zip')}
          download="dropship-pro-extension.zip"
          className="inline-flex items-center gap-2 rounded-lg border border-purple-400/40 bg-white/5 px-3 py-2 text-sm hover:bg-white/10 transition"
          title="Remplit automatiquement les formulaires Vinted, Leboncoin et eBay"
        >
          <Puzzle size={16} className="text-purple-300" /> Extension Chrome
        </a>
      </div>

      <form onSubmit={onImport} className="mt-5 flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <input
            required
            type="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-lg bg-white/10 border border-white/10 pl-9 pr-3 py-2.5 outline-none focus:border-purple-400"
          />
        </div>
        <button disabled={importing} className="btn-gradient rounded-lg px-5 font-semibold disabled:opacity-50 flex items-center gap-2">
          {importing && <Loader2 className="animate-spin" size={16} />}
          Importer
        </button>
        <button
          type="button"
          onClick={() => setBatchOpen((v) => !v)}
          className="rounded-lg border border-white/10 px-4 text-sm text-gray-300 hover:bg-white/5 flex items-center gap-1.5"
        >
          <Layers size={15} /> Lot
        </button>
      </form>

      {batchOpen && (
        <form onSubmit={onBatchImport} className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <p className="text-sm text-gray-400">Une URL par ligne, 25 maximum.</p>
          <textarea
            value={batchUrls}
            onChange={(e) => setBatchUrls(e.target.value)}
            rows={5}
            placeholder={'https://...\nhttps://...'}
            className="w-full rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm outline-none focus:border-purple-400"
          />
          <div className="flex items-center gap-3">
            <button disabled={importing} className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
              Importer le lot
            </button>
            {batchSummary && <span className="text-sm text-gray-400">{batchSummary}</span>}
          </div>

          {/*
            Chaque échec avec son adresse et sa raison.
            « 25 échoués » ne se corrige pas ; « cette adresse est une fiche
            AliExpress, passez par l'extension » se corrige.
          */}
          {batchEchecs.length > 0 && (
            <ul className="space-y-1.5 rounded-lg border border-red-400/25 bg-red-500/5 p-3">
              {batchEchecs.map((e) => (
                <li key={e.url} className="text-xs">
                  <span className="block truncate text-gray-400">{e.url}</span>
                  <span className="text-red-200">{e.error}</span>
                </li>
              ))}
            </ul>
          )}

          {/*
            L'import d'un export fournisseur.
            AliExpress Business, comme ses concurrents, exporte une sélection en
            classeur — identifiants et titres, rien d'autre. Les fiches et les
            photos sont ensuite demandées à l'API du fournisseur : c'est le seul
            chemin qui marche sur une liste, puisque ces adresses ne se laissent
            pas lire par un serveur et que l'extension travaille page par page.
          */}
          <div className="border-t border-white/10 pt-3">
            <p className="text-sm font-medium">Ou importez un fichier exporté par votre fournisseur</p>
            <p className="mt-0.5 text-xs text-gray-500">
              AliExpress Business, BigBuy, CJ… Le fournisseur doit être relié dans{' '}
              <Link to="/api-sourcing-connect" className="text-purple-300 underline underline-offset-2">
                API fournisseurs
              </Link>{' '}
              : le fichier ne contient que des références, les photos viennent de son API.
            </p>

            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10">
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={async (e) => {
                  const fichier = e.target.files?.[0]
                  e.target.value = ''
                  if (!fichier) return
                  setError(null)
                  setBatchSummary(null)
                  setImporting(true)
                  try {
                    const r = await importSupplierList(fichier)
                    const morceaux = [`${r.importes} importé(s) sur ${r.lues} ligne(s)`]
                    if (r.deja) morceaux.push(`${r.deja} déjà en catalogue`)
                    if (r.ignorees) morceaux.push(`${r.ignorees} adresse(s) non reconnue(s)`)
                    if (r.nonRelies.length) morceaux.push(`non relié : ${r.nonRelies.join(', ')}`)
                    setBatchSummary(morceaux.join(' · '))
                    // Une raison d'échec vaut mieux qu'un compte : elle dit quoi faire.
                    if (r.echecs.length) setError(r.echecs[0].raison)
                    await load()
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Import du fichier impossible')
                  } finally {
                    setImporting(false)
                  }
                }}
              />
              <span>Choisir un fichier .xlsx</span>
            </label>
          </div>
        </form>
      )}

      {/* An import runs 30 to 60 seconds — scraping, AI rewrite, then watermarking.
          Without this the screen looks frozen and people assume it crashed. */}
      {importing && (
        <div className="mt-4 rounded-xl border border-purple-400/30 bg-purple-500/5 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="animate-spin text-purple-300 shrink-0" size={20} />
            <div>
              <p className="text-sm font-medium">Import en cours — laissez cette page ouverte</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Analyse de la page, réécriture par l'IA, puis filigrane sur les photos. Comptez 30 à 60 secondes.
              </p>
            </div>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-1/3 animate-[loading_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-purple-400 to-pink-400" />
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

      <div className="mt-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-bold">Mes annonces</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {`${visible.length} / ${products.length} annonce(s)`}
            </span>
            <div className="flex rounded-lg border border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setView('grid')}
                title="Vue grille"
                aria-pressed={view === 'grid'}
                className={`rounded-md p-1.5 ${view === 'grid' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                title="Vue liste"
                aria-pressed={view === 'list'}
                className={`rounded-md p-1.5 ${view === 'list' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <List size={15} />
              </button>
            </div>
          </div>
        </div>

        {/*
          Le filtre, en menu deroulant plutot qu en bandeau a defilement.

          La file de pastilles obligeait a faire glisser horizontalement pour
          atteindre la moitie des rayons -- un geste qui n existe nulle part
          ailleurs dans l application, et que rien n annoncait. Le menu montre
          les rayons avec leur icone, puis les sous-categories du rayon ouvert.
        */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CategoryMenu
            presents={presentsCategories}
            compte={comptePar}
            valeur={categoryFilter || null}
            onChange={(c) => {
              setCategoryFilter(c.id ?? '')
              // Ce que le choix recouvre, calculé par le menu qui seul connaît
              // l'arbre : un rayon vaut pour toutes ses sous-catégories.
              setCategoryIds(c.ids)
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher dans mes annonces…"
            className="min-w-[12rem] flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400"
          />

          {/* Trier et filtrer. Trois cents annonces ne se retrouvent pas en
              faisant défiler : elles se retrouvent en réduisant la liste. */}
          <select
            value={tri}
            onChange={(e) => setTri(e.target.value as typeof tri)}
            title="Trier les annonces"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400"
          >
            <option value="date">Tri : plus récentes</option>
            <option value="prix">Tri : prix décroissant</option>
            <option value="categorie">Tri : catégorie</option>
            <option value="fournisseur">Tri : fournisseur</option>
          </select>

          <select
            value={statut}
            onChange={(e) => setStatut(e.target.value as typeof statut)}
            title="Publiées ou non"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400"
          >
            <option value="tous">Toutes</option>
            <option value="publie">Publiées</option>
            <option value="nonPublie">Non publiées</option>
          </select>

          {/*
            Affiché seulement s'il y en a — et alors impossible à manquer.
            Une annonce non réécrite ressemble en tout point à une bonne dans la
            liste : même vignette, même prix, même badge. Le seul moyen de les
            retrouver était de les ouvrir une par une.
          */}
          {nonReecrites > 0 && (
            <button
              type="button"
              onClick={() => setSeulementNonReecrites((v) => !v)}
              aria-pressed={seulementNonReecrites}
              className={`rounded-xl border px-3 py-2 text-sm transition ${
                seulementNonReecrites
                  ? 'border-amber-400/60 bg-amber-500/20 text-amber-100'
                  : 'border-amber-400/30 bg-amber-500/5 text-amber-200 hover:bg-amber-500/10'
              }`}
            >
              {`⚠ ${nonReecrites} sans réécriture`}
            </button>
          )}

          {/* Affiché seulement s'il y a un choix à faire : un menu à une seule
              entrée occupe la barre sans rien trancher. */}
          {fournisseurs.length > 1 && (
            <select
              value={fournisseurFiltre}
              onChange={(e) => setFournisseurFiltre(e.target.value)}
              title="Filtrer par fournisseur"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-purple-400"
            >
              <option value="">Tous les fournisseurs</option>
              {fournisseurs.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Selection bar: shown as soon as there is something to act on, so the
            bulk publish button never appears out of nowhere. */}
        {visible.length > 0 && (
          /*
           * Deux rangées, et non une seule qui déborde.
           *
           * Signalé le 03/09/2026 : « je ne vois pas les boutons à droite », sur
           * un écran vertical. Le groupe de droite était un `flex` **sans
           * `flex-wrap`** : six boutons — réécrire, ranger, options, supprimer,
           * analyse, publier — tenus sur une ligne qui ne pouvait pas se replier.
           * Les deux derniers sortaient du cadre, et ce sont les deux qui
           * coûtent des crédits.
           *
           * `justify-between` masquait le défaut sur un écran large : la ligne
           * paraissait équilibrée tant qu'elle tenait. Elle ne tenait qu'au-delà
           * d'environ 1 100 px.
           */
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <button
                type="button"
                onClick={toggleAllVisible}
                className="inline-flex items-center gap-2 text-xs text-gray-300 hover:text-white"
              >
                {allVisibleSelected ? <CheckSquare size={15} className="text-purple-300" /> : <Square size={15} />}
                {/* Wrapped in its own element: a bare text expression next to another
                    expression is what makes React lose the node and throw
                    « insertBefore / removeChild » when both change at once. */}
                <span>{allVisibleSelected ? 'Tout désélectionner' : 'Tout sélectionner'}</span>
              </button>
              <span className="text-xs text-gray-400">{`${selectedIds.length} sélectionnée(s)`}</span>
            </div>

            {/* Tous les gestes du lot sur la même rangée, à la même taille : des
                boutons de tailles différentes se lisent mal une fois repliés. */}
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
              {/* Ranger, poser une option, supprimer — les trois gestes qui se
                  faisaient sinon annonce par annonce. */}
              <BulkActions
                ids={selectedIds}
                onFait={async (message) => {
                  setAvis(message)
                  setSelectedIds([])
                  await load()
                }}
              />
              {/* L'analyse consomme un crédit par produit : le libellé le dit,
                  personne ne doit le découvrir sur sa facture. */}
              <button
                type="button"
                onClick={() => navigate('/analyse-marche', { state: { productIds: selectedIds } })}
                disabled={!selectedIds.length}
                title="Un crédit par produit analysé"
                className="inline-flex items-center gap-1.5 rounded-lg border border-purple-400/40 px-3 py-2 text-xs font-semibold text-purple-200 transition hover:bg-purple-500/10 disabled:opacity-40"
              >
                <TrendingUp size={14} />
                <span>{`Analyse de marché (${selectedIds.length})`}</span>
              </button>
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                disabled={!selectedIds.length}
                className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40"
              >
                <Radio size={14} />
                <span>{`Publier en lot (${selectedIds.length})`}</span>
              </button>
            </div>
          </div>
        )}

        {avis && (
          <p className="mt-2 rounded-xl border border-emerald-400/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100">
            {avis}
          </p>
        )}

        {loading ? (
          <p className="text-gray-400 text-sm mt-4">Chargement...</p>
        ) : visible.length === 0 ? (
          <p className="text-gray-400 text-sm mt-4">
            {products.length === 0 ? 'Aucune annonce pour le moment.' : 'Aucune annonce ne correspond à ce filtre.'}
          </p>
        ) : view === 'grid' ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {visible.map((p) => {
              const isSelected = selectedIds.includes(p.id)
              return (
                <Link
                  key={p.id}
                  to={`/products/${p.id}`}
                  className={`group relative rounded-xl overflow-hidden border bg-white/5 transition ${
                    isSelected ? 'border-purple-400' : 'border-white/10 hover:border-purple-400/50'
                  }`}
                >
                  <div className="aspect-square bg-black/30">
                    {p.images?.[0] && <img src={assetUrl(p.images[0])} alt="" className="w-full h-full object-cover" />}
                  </div>

                  {/* The card is a link: every control on it has to stop the click
                      from navigating. */}
                  <button
                    type="button"
                    title="Sélectionner pour une publication en lot"
                    aria-pressed={isSelected}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      toggleSelected(p.id)
                    }}
                    className={`absolute top-2 left-2 rounded-lg p-2 shadow-lg backdrop-blur transition ${
                      isSelected ? 'bg-purple-500 text-white' : 'bg-black/60 text-gray-200 hover:bg-black/80'
                    }`}
                  >
                    {isSelected ? <CheckSquare size={17} /> : <Square size={17} />}
                  </button>

                  {/* Stays visible on touch screens, which have no hover state. */}
                  {/* Always visible rather than revealed on hover: a delete control
                      nobody can find is a delete control that doesn't exist. */}
                  <button
                    type="button"
                    title="Supprimer cette annonce"
                    aria-label={`Supprimer ${p.aiTitle || p.title}`}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setPendingDelete(p)
                    }}
                    className="absolute top-2 right-2 rounded-lg bg-red-500/85 p-2 text-white shadow-lg backdrop-blur transition hover:bg-red-500 hover:scale-105"
                  >
                    <Trash2 size={17} />
                  </button>

                  {/* Sous la suppression, et pas à côté : deux boutons de même
                      taille collés se confondent, et l'un des deux est
                      irréversible. */}
                  <button
                    type="button"
                    title="Dupliquer cette annonce (aucun crédit)"
                    aria-label={`Dupliquer ${p.aiTitle || p.title}`}
                    disabled={duplication === p.id}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      dupliquer(p)
                    }}
                    className="absolute top-14 right-2 rounded-lg bg-black/60 p-2 text-gray-200 shadow-lg backdrop-blur transition hover:bg-black/80 hover:scale-105 disabled:opacity-50"
                  >
                    {duplication === p.id ? <Loader2 size={17} className="animate-spin" /> : <Copy size={17} />}
                  </button>
                  <div className="p-3">
                    <p className="text-sm font-medium line-clamp-2">{p.aiTitle || p.title}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-bold text-purple-300">
                        {`${Number(p.sellingPrice ?? 0).toFixed(2)} ${p.currency}`}
                      </span>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_COLOR[p.status]}`}>
                        {STATUS_LABEL[p.status]}
                      </span>
                    </div>

                    {/* Où elle est réellement en ligne, sans ouvrir la fiche. */}
                    <div className="mt-2">
                      <PublishedBadges publications={p.publications ?? []} platforms={platforms} />
                    </div>
                  </div>
                </Link>
              )
            })}
            <div className="sm:col-span-2 lg:col-span-3">
              <VoirPlus reste={reste} onPlus={plus} onTout={tout} />
            </div>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-white/5 rounded-xl border border-white/10 bg-white/5">
            {visible.map((p) => {
              const isSelected = selectedIds.includes(p.id)
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-3 py-2.5 transition ${isSelected ? 'bg-purple-500/10' : ''}`}
                >
                  <button
                    type="button"
                    title="Sélectionner pour une publication en lot"
                    aria-pressed={isSelected}
                    onClick={() => toggleSelected(p.id)}
                    className={isSelected ? 'text-purple-300' : 'text-gray-500 hover:text-gray-300'}
                  >
                    {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>

                  <Link to={`/products/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-black/30">
                      {p.images?.[0] && (
                        <img src={assetUrl(p.images[0])} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm">{p.aiTitle || p.title}</p>
                    <div className="hidden shrink-0 sm:block">
                      <PublishedBadges publications={p.publications ?? []} platforms={platforms} max={5} />
                    </div>
                    <span className="shrink-0 text-sm font-bold text-purple-300">
                      {`${Number(p.sellingPrice ?? 0).toFixed(2)} ${p.currency}`}
                    </span>
                    <span
                      className={`hidden shrink-0 rounded-full px-2 py-0.5 text-xs sm:inline ${STATUS_COLOR[p.status]}`}
                    >
                      {STATUS_LABEL[p.status]}
                    </span>
                  </Link>

                  <button
                    type="button"
                    title="Dupliquer cette annonce (aucun crédit)"
                    aria-label={`Dupliquer ${p.aiTitle || p.title}`}
                    disabled={duplication === p.id}
                    onClick={() => dupliquer(p)}
                    className="shrink-0 rounded-lg p-2 text-gray-400 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                  >
                    {duplication === p.id ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
                  </button>

                  <button
                    type="button"
                    title="Supprimer cette annonce"
                    aria-label={`Supprimer ${p.aiTitle || p.title}`}
                    onClick={() => setPendingDelete(p)}
                    className="shrink-0 rounded-lg p-2 text-red-400 transition hover:bg-red-500/10"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )
            })}

            {/*
              Le « voir plus » manquait ici, et seulement ici.
              La vue grille l'a toujours eu ; la liste s'arrêtait à dix annonces
              sans rien pour aller plus loin — un catalogue de cent cinquante
              paraissait en compter dix. Il est dans le conteneur bordé, séparé
              par un filet, pour qu'on le lise comme la fin de la liste et non
              comme une ligne de plus.
            */}
            {reste > 0 && (
              <div className="px-3 py-3">
                <VoirPlus reste={reste} onPlus={plus} onTout={tout} />
              </div>
            )}
          </div>
        )}
      </div>

      {bulkOpen && (
        <BulkPublishDialog
          productIds={selectedIds}
          platforms={platforms}
          onClose={() => setBulkOpen(false)}
          onDone={load}
        />
      )}
    </Layout>
  )
}
