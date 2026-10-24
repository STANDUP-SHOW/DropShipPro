import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ExternalLink, Loader2, PackagePlus, Smartphone, Trash2 } from 'lucide-react'
import { Layout } from '../../components/Layout'
import { EntetePower } from '../../components/desktop/DesktopPower'
import { api } from '../../lib/api'
import { dpApi, pont, useDesktop, type Partage } from '../../lib/desktopPower'

const STATUTS: Record<Partage['statut'], string> = { NEW: 'À importer', CLAIMED: 'Pris par l’application', DONE: 'Fait' }

/**
 * RemoteShipping (DESKTOP POWER, 24/10/2026) : les produits choisis avec le
 * téléphone (menu « Partager » vers DropShipper, page /partager), la même liste
 * que celle de l'application mobile et du desktop (SharedLink).
 *
 * « Importer » : dans l'application, la fiche est lue par le navigateur intégré
 * (Temu, Shein, AliExpress compris) ; dans un navigateur ordinaire, le serveur
 * l'importe s'il sait la lire, sinon il le dit.
 */
export default function RemoteShipping() {
  const p = pont()
  const [liste, setListe] = useState<Partage[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [etats, setEtats] = useState<Record<string, string>>({})
  const [voirFaits, setVoirFaits] = useState(false)
  const etat = useDesktop()
  const [lien, setLien] = useState('')
  const [retour, setRetour] = useState<string | null>(null)

  // Comme l'ancienne barre de l'application : coller un lien, ou capturer les liens copiés.
  const partager = async (texte: string) => {
    const url = texte.trim().split(/\s+/)[0]
    if (!p || !url) return
    const r = await p.partager(url)
    setRetour(r.ok ? 'Ajouté à la liste.' : r.erreur || 'Lien refusé.')
    if (r.ok) {
      setLien('')
      charger()
    }
  }

  const charger = () =>
    dpApi
      .partages()
      .then((r) => setListe(r.partages))
      .catch((e: Error) => {
        setErreur(e.message)
        setListe([])
      })
  useEffect(() => {
    charger()
  }, [])

  const importer = async (l: Partage) => {
    setEtats((m) => ({ ...m, [l.id]: '…' }))
    try {
      if (p) {
        const r = await p.importer({ url: l.url, id: l.id })
        if (!r.ok) throw new Error(r.erreur || 'Import impossible.')
      } else {
        await api.importProduct(l.url)
        await dpApi.partageFait(l.id)
      }
      setEtats((m) => ({ ...m, [l.id]: 'Importé' }))
      charger()
    } catch (e) {
      setEtats((m) => ({ ...m, [l.id]: (e as Error).message }))
    }
  }

  const aFaire = (liste ?? []).filter((l) => l.statut !== 'DONE')
  const faits = (liste ?? []).filter((l) => l.statut === 'DONE')
  const affiches = voirFaits ? faits : aFaire

  return (
    <Layout>
      <EntetePower
        icone={Smartphone}
        titre="REMOTESHIPPING"
        chapo="Les produits que vous avez sélectionnés avec votre téléphone : importez-les dans vos annonces et vendez-les partout. Sur le téléphone, ouvrez une fiche chez n'importe quel fournisseur, « Partager », puis DropShipper : elle arrive ici."
      />

      {p ? (
        <section className="case-ds mb-4 flex flex-col gap-2 p-4 text-xs md:flex-row md:items-center">
          <input
            value={lien}
            onChange={(e) => setLien(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') partager(lien)
            }}
            placeholder="Ajouter un lien depuis ce PC : https://… (Entrée)"
            className="flex-1 rounded-lg border border-[var(--trait)] bg-[var(--nuit)] px-3 py-1.5 text-white outline-none focus:border-[var(--marque-rose)]"
          />
          <label className="flex items-center gap-2 text-gray-300">
            <input type="checkbox" checked={Boolean(etat?.capture)} onChange={(e) => p.capture(e.target.checked)} />
            Capturer les liens copiés
          </label>
          {retour ? <span className="text-gray-400">{retour}</span> : null}
        </section>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => setVoirFaits(false)} className={`rounded-full border px-3 py-1 ${!voirFaits ? 'border-[var(--marque-rose)] text-white' : 'border-[var(--trait)] text-gray-400'}`}>
          À importer ({aFaire.length})
        </button>
        <button type="button" onClick={() => setVoirFaits(true)} className={`rounded-full border px-3 py-1 ${voirFaits ? 'border-[var(--marque-rose)] text-white' : 'border-[var(--trait)] text-gray-400'}`}>
          Déjà faits ({faits.length})
        </button>
        {!p ? <span className="text-gray-500">Hors de l'application, seules les fiches que le serveur sait lire s'importent ici.</span> : null}
      </div>

      {erreur ? <p className="text-xs text-red-300">{erreur}</p> : null}
      {!liste ? (
        <p className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={14} className="animate-spin" /> Chargement…
        </p>
      ) : !affiches.length ? (
        <section className="case-ds p-5 text-xs text-gray-400">
          {voirFaits
            ? 'Rien encore.'
            : 'Aucun produit en attente. Sur un téléphone Android, ouvrez drop-shipper.fr et ajoutez-le à l’écran d’accueil : DropShipper apparaît alors dans le menu « Partager » de vos applications.'}
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {affiches.map((l) => {
            let hote = l.url
            try {
              hote = new URL(l.url).hostname.replace(/^www\./, '')
            } catch {
              /* adresse brute */
            }
            return (
              <article key={l.id} className="case-ds flex flex-col gap-2 p-4">
                <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-widest">
                  <span className="text-[var(--marque-rose)]">{hote}</span>
                  <span className="text-gray-500">{STATUTS[l.statut]}</span>
                </div>
                <h3 className="line-clamp-2 text-sm font-semibold">{l.titre || l.note || l.url}</h3>
                <p className="text-[11px] text-gray-500">
                  Partagé le {new Date(l.cree).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · depuis {l.source}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  {l.statut !== 'DONE' ? (
                    <button type="button" onClick={() => importer(l)} disabled={Boolean(etats[l.id])} className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-60">
                      <PackagePlus size={14} /> {etats[l.id] ?? 'Importer'}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                      <Check size={14} /> Fait
                    </span>
                  )}
                  <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-gray-400 underline hover:text-white">
                    <ExternalLink size={12} /> Fiche
                  </a>
                  <button
                    type="button"
                    onClick={() => dpApi.partageRetirer(l.id).then(charger).catch((e: Error) => setErreur(e.message))}
                    className="ml-auto text-gray-500 hover:text-red-300"
                    aria-label="Retirer de la liste"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
      <p className="mt-4 text-[11px] text-gray-500">
        Chaque import coûte 12 drops, comme tout import. Pour publier ensuite : <Link to="/dashboard" className="underline hover:text-white">Mes annonces</Link>, puis « Publier ».
      </p>
    </Layout>
  )
}
