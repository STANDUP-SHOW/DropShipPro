import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Upload, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react'
import { api } from '../lib/api'

type Etat = Awaited<ReturnType<typeof api.canauxVentes>>
type Canal = Etat['canaux'][number]

/** « il y a 12 min », « il y a 3 h », « le 28/09 ». */
function depuis(iso: string | null): string {
  if (!iso) return 'jamais relevé'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return "relevé à l'instant"
  if (min < 60) return `relevé il y a ${min} min`
  if (min < 24 * 60) return `relevé il y a ${Math.round(min / 60)} h`
  return `relevé le ${new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`
}

/**
 * La remontée des ventes, canal par canal.
 *
 * Les canaux à API (Shopify, eBay, les enseignes Mirakl) sont relevés toutes
 * les quinze minutes par le serveur : on montre la dernière relève et, surtout,
 * pourquoi elle a échoué — une permission manquante ne doit plus se lire dans
 * un journal serveur. Tous les autres canaux passent par l'import de l'export
 * de commandes de leur back-office.
 */
export function CanauxVentes({ platforms, onNouvelles }: { platforms: Array<{ id: string; label: string }>; onNouvelles: () => void }) {
  const [etat, setEtat] = useState<Etat | null>(null)
  const [enCours, setEnCours] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string } | null>(null)
  const [plateformeImport, setPlateformeImport] = useState('')
  const fichier = useRef<HTMLInputElement>(null)

  const nom = (id: string) => platforms.find((p) => p.id === id)?.label ?? id

  async function charger() {
    try {
      setEtat(await api.canauxVentes())
    } catch {
      setEtat({ captees: [], canaux: [] })
    }
  }
  useEffect(() => {
    charger()
  }, [])

  async function relever(c: Canal) {
    setEnCours(c.platform)
    setMessage(null)
    try {
      const r = await api.releverVentes(c.platform)
      if (r.erreur) setMessage({ ton: 'erreur', texte: `${nom(c.platform)} : ${r.erreur}` })
      else setMessage({ ton: 'ok', texte: `${nom(c.platform)} : ${r.bilan?.creees ?? 0} nouvelle(s) vente(s), ${r.suivis} suivi(s) transmis.` })
      await charger()
      if (r.bilan?.creees) onNouvelles()
    } catch (e) {
      setMessage({ ton: 'erreur', texte: e instanceof Error ? e.message : 'La relève a échoué.' })
    } finally {
      setEnCours(null)
    }
  }

  async function importer(f: File) {
    if (!plateformeImport) {
      setMessage({ ton: 'erreur', texte: "Choisissez d'abord la plateforme dont vient le fichier." })
      return
    }
    setEnCours('import')
    setMessage(null)
    try {
      const r = await api.importerCommandes(plateformeImport, await f.text())
      const morceaux = [`${r.creees} vente(s) ajoutée(s)`]
      if (r.deja) morceaux.push(`${r.deja} déjà connue(s)`)
      if (r.ecartees) morceaux.push(`${r.ecartees} annulée(s) ou impayée(s) écartée(s)`)
      if (r.sansProduit.length) morceaux.push(`${r.sansProduit.length} ligne(s) sans produit reconnu (${r.sansProduit.slice(0, 3).map((s) => s.sku || s.titre).join(', ')}${r.sansProduit.length > 3 ? '…' : ''})`)
      setMessage({ ton: 'ok', texte: `${nom(plateformeImport)} : ${morceaux.join(' · ')}.` })
      if (r.creees) onNouvelles()
    } catch (e) {
      setMessage({ ton: 'erreur', texte: e instanceof Error ? e.message : "L'import a échoué." })
    } finally {
      setEnCours(null)
      if (fichier.current) fichier.current.value = ''
    }
  }

  const automatiques = etat?.canaux.filter((c) => c.automatique) ?? []
  const manuels = etat?.canaux.filter((c) => !c.automatique) ?? []

  return (
    <section className="mt-5 rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Ventes captées</h2>
        <p className="text-xs text-gray-400">
          Relève automatique toutes les 15 min · {etat ? etat.captees.length : '…'} canaux remontent seuls, tous les autres par import
        </p>
      </div>

      {etat && !automatiques.length && (
        <p className="text-sm text-gray-400">
          Aucun canal à relève automatique n'est relié. Reliez Shopify, eBay ou une enseigne Mirakl (La Redoute, Leclerc, Carrefour…) dans les
          paramètres des plateformes, ou importez vos exports de commandes ci-dessous.
        </p>
      )}

      {automatiques.length > 0 && (
        <ul className="divide-y divide-white/5">
          {automatiques.map((c) => (
            <li key={c.platform} className="py-2.5 flex flex-wrap items-start gap-3">
              <div className="min-w-[9rem] font-medium text-sm">{nom(c.platform)}</div>
              <div className="flex-1 min-w-[14rem] text-sm space-y-1">
                {c.ventesErreur ? (
                  <p className="flex gap-1.5 text-red-300">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" /> <span>{c.ventesErreur}</span>
                  </p>
                ) : (
                  <p className="flex gap-1.5 text-emerald-300">
                    <CheckCircle2 size={15} className="shrink-0 mt-0.5" />
                    <span>
                      {depuis(c.ventesReleveesAt) + (c.ventesBilan ? ` · ${c.ventesBilan.creees} nouvelle(s) à la dernière relève` : '')}
                    </span>
                  </p>
                )}
                {c.ventesBilan?.signal && <p className="text-amber-300 text-xs">{c.ventesBilan.signal}</p>}
                {!!c.ventesBilan?.sansProduit.length && (
                  <p className="text-gray-400 text-xs">
                    {c.ventesBilan.sansProduit.length} ligne(s) vendue(s) sans produit reconnu : référence{' '}
                    {c.ventesBilan.sansProduit.slice(0, 3).map((s) => s.sku || '(vide)').join(', ')}. Vérifiez la référence (SKU) de l'annonce.
                  </p>
                )}
              </div>
              <button
                onClick={() => relever(c)}
                disabled={enCours !== null}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs flex items-center gap-1.5 hover:bg-white/10 disabled:opacity-50"
              >
                <RefreshCw size={13} className={enCours === c.platform ? 'animate-spin' : ''} /> Relever maintenant
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-dashed border-white/15 p-4 flex flex-wrap items-center gap-3">
        <FileSpreadsheet size={18} className="text-gray-400 shrink-0" />
        <p className="text-sm text-gray-300 flex-1 min-w-[16rem]">
          <span className="font-medium">Importer des commandes</span> : exportez-les en CSV depuis le back-office de la plateforme (Amazon,
          Cdiscount, Etsy, Vinted…). Les colonnes sont reconnues seules ; réimporter le même fichier ne crée pas de doublon.
          {manuels.length > 0 && <span className="text-gray-400"> Canaux reliés sans relève automatique : {manuels.map((c) => nom(c.platform)).join(', ')}.</span>}
        </p>
        <select
          value={plateformeImport}
          onChange={(e) => setPlateformeImport(e.target.value)}
          className="rounded-lg bg-white/10 border border-white/10 px-3 py-2 text-sm"
        >
          <option value="">Plateforme…</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          ref={fichier}
          type="file"
          accept=".csv,.txt,text/csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importer(e.target.files[0])}
        />
        <button
          onClick={() => fichier.current?.click()}
          disabled={enCours !== null}
          className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
        >
          <Upload size={15} /> {enCours === 'import' ? 'Import…' : 'Choisir le fichier'}
        </button>
      </div>

      {message && (
        <p className={`text-sm ${message.ton === 'ok' ? 'text-emerald-300' : 'text-red-300'}`} role="status">
          {message.texte}
        </p>
      )}
    </section>
  )
}
