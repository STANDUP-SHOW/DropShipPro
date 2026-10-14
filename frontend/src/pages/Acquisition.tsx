import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Link2, Loader2, Layers, ListPlus, Plug, FileSpreadsheet, ArrowRight } from 'lucide-react'
import { Layout } from '../components/Layout'
import { IconeChrome } from '../components/IconeChrome'
import { StatsReduites } from '../components/stats/StatsReduites'
import { api, importSupplierList } from '../lib/api'

/**
 * Acquérir des produits : par où un produit entre dans le catalogue.
 *
 * **Refaite le 14/10/2026 à la demande de Max** : les statistiques réduites
 * d'abord (elles portent déjà le titre « Acquisition produits »), puis l'import
 * par adresse — déplacé ici depuis « Mes annonces » —, l'extension Chrome,
 * l'import en lot et les listes exportées côte à côte, et les fournisseurs
 * reliés par API. L'installation de l'extension vit sur sa page, /extension.
 */

function Case({ icone, titre, children, className = '' }: { icone: ReactNode; titre: string; children: ReactNode; className?: string }) {
  return (
    <section className={`case-ds min-w-0 p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{icone}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-[var(--texte)]">{titre}</h2>
          {children}
        </div>
      </div>
    </section>
  )
}

const Texte = ({ children }: { children: ReactNode }) => <p className="mt-1 text-xs leading-relaxed text-[var(--texte-2)]">{children}</p>

const LIEN = 'mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--marque-orange)] hover:underline'

/** Coller une adresse (ou vingt-cinq) : le formulaire qui vivait en tête de « Mes annonces ». */
function ImportParAdresse() {
  const [url, setUrl] = useState('')
  const [lotOuvert, setLotOuvert] = useState(false)
  const [lotUrls, setLotUrls] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importe, setImporte] = useState<{ id: string; titre: string } | null>(null)
  const [lotResume, setLotResume] = useState<string | null>(null)
  /** Le détail des échecs, adresse par adresse : « 25 échoués » ne se corrige pas. */
  const [lotEchecs, setLotEchecs] = useState<Array<{ url: string; error: string }>>([])

  async function onImport(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setImporte(null)
    setImporting(true)
    try {
      const p: any = await api.importProduct(url)
      setUrl('')
      if (p?.id) setImporte({ id: p.id, titre: p.aiTitle || p.title || 'Votre annonce' })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'import")
    } finally {
      setImporting(false)
    }
  }

  /**
   * Une adresse par requête : un import prend trente à soixante secondes, et
   * vingt-cinq dans une seule requête faisaient tomber la connexion
   * (« failed to fetch ») pendant que le serveur continuait d'importer.
   */
  async function onImportLot(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setImporte(null)
    setLotResume(null)
    setLotEchecs([])
    const urls = lotUrls
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, 25)
    if (!urls.length) return

    setImporting(true)
    const echecs: Array<{ url: string; error: string }> = []
    let reussies = 0
    for (const [i, u] of urls.entries()) {
      setLotResume(`Import ${i + 1} sur ${urls.length}…`)
      try {
        const res = await api.importBatch([u])
        const ligne = res.results[0]
        if (ligne?.ok) reussies++
        else echecs.push({ url: u, error: ligne?.error || 'Échec sans détail' })
      } catch (err) {
        // Un solde épuisé arrête le lot : les suivantes échoueraient toutes pareil.
        const message = err instanceof Error ? err.message : "Échec de l'import"
        echecs.push({ url: u, error: message })
        if (/drop|crédit|credit|solde/i.test(message)) {
          setLotResume(`Arrêté à ${i + 1} sur ${urls.length} : ${message}`)
          break
        }
      }
    }
    setLotEchecs(echecs)
    setLotResume(`${reussies} importée(s), ${echecs.length} en échec sur ${urls.length}.`)
    // Seules les adresses en échec restent dans le champ, pour relancer sans retrier.
    setLotUrls(echecs.map((e) => e.url).join('\n'))
    setImporting(false)
  }

  return (
    <Case icone={<Link2 size={18} className="text-[var(--marque-orange)]" />} titre="Import par adresse" className="md:col-span-2">
      <Texte>
        Collez l'adresse d'une fiche produit — Temu, JoyBuy, ou n'importe quel site : le serveur lit la page, l'IA réécrit l'annonce, les
        photos sont filigranées. Temu, AliExpress, Shein et JoyBuy construisent leurs fiches en JavaScript : un serveur n'en reçoit qu'une
        coquille vide, l'import est alors refusé avec renvoi vers l'extension.
      </Texte>

      <form onSubmit={onImport} className="mt-3 flex flex-wrap gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--texte-3)]" size={16} />
          <input
            required
            type="url"
            placeholder="https://..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-lg border border-[var(--trait)] bg-white/[0.04] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--marque-orange)]"
          />
        </div>
        <button disabled={importing} className="btn-gradient flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
          {importing ? <Loader2 className="animate-spin" size={16} /> : null}
          <span>Importer</span>
        </button>
        <button
          type="button"
          onClick={() => setLotOuvert((v) => !v)}
          aria-expanded={lotOuvert}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--trait)] px-4 py-2.5 text-sm text-[var(--texte-2)] hover:border-[var(--trait-fort)] hover:text-[var(--texte)]"
        >
          <Layers size={15} />
          <span>Lot</span>
        </button>
      </form>

      {lotOuvert ? (
        <form onSubmit={onImportLot} className="mt-3 space-y-3 rounded-xl border border-[var(--trait)] bg-white/[0.02] p-3">
          <p className="text-xs text-[var(--texte-2)]">Une adresse par ligne, 25 au plus.</p>
          <textarea
            value={lotUrls}
            onChange={(e) => setLotUrls(e.target.value)}
            rows={5}
            placeholder={'https://...\nhttps://...'}
            className="w-full rounded-lg border border-[var(--trait)] bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-[var(--marque-orange)]"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={importing} className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
              Importer le lot
            </button>
            {lotResume ? <span className="text-xs text-[var(--texte-2)]">{lotResume}</span> : null}
            {lotResume && !importing ? (
              <Link to="/dashboard" className="text-xs font-semibold text-[var(--marque-orange)] hover:underline">
                Voir mes annonces
              </Link>
            ) : null}
          </div>
          {lotEchecs.length > 0 ? (
            <ul className="space-y-1.5 rounded-lg border border-red-400/25 bg-red-500/5 p-3">
              {lotEchecs.map((e) => (
                <li key={e.url} className="text-xs">
                  <span className="block truncate text-[var(--texte-3)]">{e.url}</span>
                  <span className="text-red-200">{e.error}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      ) : null}

      {/* Un import dure 30 à 60 secondes : sans ce bandeau, l'écran paraît figé. */}
      {importing ? (
        <div className="mt-3 rounded-xl border border-[var(--trait)] bg-white/[0.02] p-3">
          <div className="flex items-center gap-3">
            <Loader2 className="shrink-0 animate-spin text-[var(--marque-orange)]" size={18} />
            <div>
              <p className="text-sm font-medium text-[var(--texte)]">Import en cours — laissez cette page ouverte</p>
              <p className="mt-0.5 text-xs text-[var(--texte-2)]">
                Analyse de la page, réécriture par l'IA, puis filigrane sur les photos. Comptez 30 à 60 secondes.
              </p>
            </div>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--trait)]">
            <div className="h-full w-1/3 animate-[loading_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-[#f28a4b] to-[#e85290]" />
          </div>
        </div>
      ) : null}

      {importe ? (
        <p className="mt-3 rounded-lg border border-emerald-400/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-100">
          <span>{`Importée : ${importe.titre}. `}</span>
          <Link to={`/products/${importe.id}`} className="font-semibold underline underline-offset-2">
            Ouvrir l'annonce
          </Link>
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
    </Case>
  )
}

/** Le fichier exporté par un fournisseur : des références, les fiches viennent de son API. */
function ImportListe() {
  const [envoi, setEnvoi] = useState(false)
  const [resume, setResume] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--trait)] px-3 py-2 text-xs font-semibold text-[var(--texte)] hover:border-[var(--trait-fort)]">
        <input
          type="file"
          accept=".xlsx"
          className="hidden"
          disabled={envoi}
          onChange={async (e) => {
            const fichier = e.target.files?.[0]
            e.target.value = ''
            if (!fichier) return
            setError(null)
            setResume(null)
            setEnvoi(true)
            try {
              const r = await importSupplierList(fichier)
              const morceaux = [`${r.importes} importé(s) sur ${r.lues} ligne(s)`]
              if (r.deja) morceaux.push(`${r.deja} déjà en catalogue`)
              if (r.ignorees) morceaux.push(`${r.ignorees} adresse(s) non reconnue(s)`)
              if (r.nonRelies.length) morceaux.push(`non relié : ${r.nonRelies.join(', ')}`)
              setResume(morceaux.join(' · '))
              // Une raison d'échec vaut mieux qu'un compte : elle dit quoi faire.
              if (r.echecs.length) setError(r.echecs[0].raison)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Import du fichier impossible')
            } finally {
              setEnvoi(false)
            }
          }}
        />
        {envoi ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
        <span>{envoi ? 'Import du fichier…' : 'Choisir un fichier .xlsx'}</span>
      </label>
      {resume ? <p className="mt-2 text-xs text-[var(--texte-2)]">{resume}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </>
  )
}

export default function Acquisition() {
  return (
    <Layout>
      <StatsReduites ids={['acquisition']} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ImportParAdresse />

        <Case icone={<IconeChrome size={20} />} titre="Extension Chrome" className="md:col-span-2">
          <Texte>
            Elle lit la fiche dans votre navigateur, pendant qu'elle est affichée — c'est la seule voie possible sur Temu, AliExpress et Shein.
            Un bouton se pose sur chaque fiche produit ; vous choisissez les photos, l'import part avec ce que la page montrait vraiment :
            prix, variantes, galerie.
          </Texte>
          <Link to="/extension" className={LIEN}>
            Installer et découvrir l'extension <ArrowRight size={12} />
          </Link>
        </Case>

        <Case icone={<ListPlus size={18} className="text-[var(--marque-rose)]" />} titre="Import en lot">
          <Texte>
            Le panneau latéral de l'extension garde une liste pendant que vous naviguez de fiche en fiche : « Ajouter ce produit », jusqu'à
            vingt-cinq, puis un seul clic importe tout. Chaque fiche est relevée au moment où vous l'ajoutez — jamais après coup, jamais de
            mémoire. Sur les autres sites, le bouton « Lot » de l'import par adresse prend vingt-cinq adresses d'un coup.
          </Texte>
        </Case>

        <Case icone={<FileSpreadsheet size={18} className="text-[#fdbf06]" />} titre="Listes exportées">
          <Texte>
            AliExpress Business, BigBuy, CJ… exportent une sélection en fichier — identifiants, titres, adresses, rien de plus. C'est suffisant
            si le fournisseur est relié par API : l'identifiant permet alors de demander la fiche complète, photos et prix compris.
          </Texte>
          <ImportListe />
        </Case>

        <Case icone={<Plug size={18} className="text-[#a78bfa]" />} titre="Fournisseurs reliés par API" className="md:col-span-2">
          <Texte>
            BigBuy, CJ Dropshipping et AliExpress (par clé) se branchent dans la section Sourcing : le catalogue s'interroge directement, les
            prix et les stocks se relèvent, et les commandes fournisseur peuvent partir toutes seules après une vente.
          </Texte>
          <Link to="/fournisseurs" className={LIEN}>
            Brancher un fournisseur <ArrowRight size={12} />
          </Link>
        </Case>
      </div>
    </Layout>
  )
}
