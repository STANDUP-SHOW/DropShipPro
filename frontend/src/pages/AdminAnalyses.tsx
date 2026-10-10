import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { FolderInput, Search, Eye, Download, Check } from 'lucide-react'
import { Layout } from '../components/Layout'
import { useAuth } from '../lib/auth'
import { demoAutorise } from '../lib/demo'
import { api, type AnalysesDriveListe, type AnalysesDriveRapport } from '../lib/api'

const ADRESSE_PAR_DEFAUT = 'https://drive.google.com/drive/folders/17mUuLYxUAzt9PFBNv_SCBdzHlCyEQM1k'

const LIBELLE_STATUT: Record<AnalysesDriveRapport['lignes'][number]['statut'], string> = {
  importe: 'Importée',
  apercu: 'À importer',
  doublon: 'Doublon ignoré',
  refuse: 'Refusée',
}

const COULEUR_STATUT: Record<AnalysesDriveRapport['lignes'][number]['statut'], string> = {
  importe: 'text-emerald-400',
  apercu: 'text-sky-300',
  doublon: 'text-gray-400',
  refuse: 'text-red-400',
}

/**
 * Back-office « Analyses » : import manuel d'analyses faites par d'autres
 * agents et rangées dans un dossier Google Drive public (demandé par Max le
 * 10/10/2026). Lister, regarder la qualité, importer : les analyses passent
 * par le même lecteur que les nôtres et les mêmes filtres publics.
 *
 * Le garde `demoAutorise` ne fait que cacher la page ; la vraie sécurité est
 * côté serveur (requireAuth + requireAdmin sur /admin/analyses-drive).
 */
export default function AdminAnalyses() {
  const { user } = useAuth()
  const [adresse, setAdresse] = useState(ADRESSE_PAR_DEFAUT)
  const [liste, setListe] = useState<AnalysesDriveListe | null>(null)
  const [choisies, setChoisies] = useState<Set<string>>(new Set())
  const [rapport, setRapport] = useState<AnalysesDriveRapport | null>(null)
  const [enCours, setEnCours] = useState<'liste' | 'apercu' | 'import' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  if (!demoAutorise(user?.email)) return <Navigate to="/dashboard" replace />

  const lister = async () => {
    setEnCours('liste')
    setErreur(null)
    setRapport(null)
    try {
      const l = await api.analysesDriveLister(adresse)
      setListe(l)
      // Preselect the dates that hold something new.
      setChoisies(new Set(l.dates.filter((d) => d.etudes.some((e) => e.importable && !e.dejaEnBase)).map((d) => d.date)))
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Lecture du dossier impossible')
      setListe(null)
    } finally {
      setEnCours(null)
    }
  }

  const importer = async (essai: boolean) => {
    setEnCours(essai ? 'apercu' : 'import')
    setErreur(null)
    try {
      setRapport(await api.analysesDriveImporter(adresse, [...choisies], essai))
      if (!essai) setListe(await api.analysesDriveLister(adresse))
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Import impossible')
    } finally {
      setEnCours(null)
    }
  }

  const basculer = (date: string) => {
    const s = new Set(choisies)
    if (s.has(date)) s.delete(date)
    else s.add(date)
    setChoisies(s)
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FolderInput size={22} className="text-orange-400" />
          <span>Importer des analyses</span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-400">
          Analyses faites par d'autres agents, rangées par date dans un dossier Google Drive public. Elles entrent
          dans la même base que les nôtres : les pages publiques n'en montrent ni fournisseur ni prix d'achat. Un
          rayon que nous avons déjà pour le même jour garde notre analyse.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/…"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-orange-400/60"
        />
        <button
          type="button"
          onClick={lister}
          disabled={!adresse.trim() || enCours !== null}
          className="btn-gradient inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          <Search size={15} />
          <span>{enCours === 'liste' ? 'Lecture du dossier…' : 'Lire le dossier'}</span>
        </button>
      </div>

      {erreur ? <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{erreur}</p> : null}

      {liste ? (
        liste.dates.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-gray-400">
            Aucun dossier daté (AAAA-MM-JJ) dans ce dossier.
          </p>
        ) : (
          <div className="mb-6 space-y-3">
            {liste.dates.map((d) => {
              const importables = d.etudes.filter((e) => e.importable)
              const nouvelles = importables.filter((e) => !e.dejaEnBase)
              return (
                <label
                  key={d.date}
                  className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/[0.07]"
                >
                  <input type="checkbox" checked={choisies.has(d.date)} onChange={() => basculer(d.date)} className="mt-1 accent-orange-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-semibold">{d.date}</span>
                      <span className="text-xs text-gray-400">
                        {`${importables.length} rayon(s) · ${nouvelles.length} nouveau(x) · ${d.ignores.length} document(s) non importable(s)`}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {d.etudes.map((e) => (
                        <span
                          key={`${e.categorie}/${e.theme}`}
                          title={e.fichiers.join(', ')}
                          className={`rounded-md px-2 py-0.5 text-xs ${
                            !e.importable ? 'bg-red-500/10 text-red-300' : e.dejaEnBase ? 'bg-white/5 text-gray-500' : 'bg-orange-500/10 text-orange-200'
                          }`}
                        >
                          {`${e.categorie} / ${e.theme}${e.dejaEnBase ? ' (déjà là)' : ''}${e.doublons.length ? ' ×2' : ''}`}
                        </span>
                      ))}
                    </div>
                  </div>
                </label>
              )
            })}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => importer(true)}
                disabled={!choisies.size || enCours !== null}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-50"
              >
                <Eye size={15} />
                <span>{enCours === 'apercu' ? 'Vérification…' : 'Vérifier la qualité'}</span>
              </button>
              <button
                type="button"
                onClick={() => importer(false)}
                disabled={!choisies.size || enCours !== null}
                className="btn-gradient inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                <Download size={15} />
                <span>{enCours === 'import' ? 'Import en cours…' : `Importer ${choisies.size} date(s)`}</span>
              </button>
            </div>
          </div>
        )
      ) : null}

      {rapport ? <RapportImport rapport={rapport} /> : null}
    </Layout>
  )
}

function RapportImport({ rapport }: { rapport: AnalysesDriveRapport }) {
  const titre = rapport.essai
    ? `Aperçu : ${rapport.aImporter} rayon(s) à importer, ${rapport.doublons} doublon(s), ${rapport.refusees} refusé(s)`
    : `${rapport.importees} rayon(s) importé(s), ${rapport.doublons} doublon(s) ignoré(s), ${rapport.refusees} refusé(s)`
  const gardes = rapport.lignes.filter((l) => l.statut === 'importe' || l.statut === 'apercu')
  return (
    <section className="rounded-xl border border-white/10">
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
        {rapport.essai ? null : <Check size={16} className="text-emerald-400" />}
        <h2 className="font-semibold">{titre}</h2>
        <span className="text-xs text-gray-400">
          {`Contrat (20 produits, 20 adresses, prix sur 18) : ${rapport.conformes} conforme(s) sur ${gardes.length}`}
          {rapport.rapportsEnBase != null ? ` · ${rapport.rapportsEnBase} rapports en ligne` : ''}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Rayon</th>
              <th className="px-4 py-2 font-medium">Statut</th>
              <th className="px-4 py-2 font-medium">Produits</th>
              <th className="px-4 py-2 font-medium">Adresses</th>
              <th className="px-4 py-2 font-medium">Avec prix</th>
              <th className="px-4 py-2 font-medium">Marketing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rapport.lignes.map((l, i) => (
              <tr key={`${l.date}-${l.rayon}-${i}`}>
                <td className="px-4 py-2 text-gray-400">{l.date}</td>
                <td className="px-4 py-2">{l.rayon}</td>
                <td className={`px-4 py-2 ${COULEUR_STATUT[l.statut]}`}>
                  {LIBELLE_STATUT[l.statut]}
                  {l.raison ? <span className="block text-xs text-gray-500">{l.raison}</span> : null}
                </td>
                <td className="px-4 py-2">{l.produits ?? '—'}</td>
                <td className="px-4 py-2">{l.urlsDistinctes ?? '—'}</td>
                <td className="px-4 py-2">{l.avecPrix ?? '—'}</td>
                <td className="px-4 py-2">{l.marketing == null ? '—' : l.marketing ? 'oui' : 'non'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rapport.ignores.length ? (
        <details className="border-t border-white/10 px-4 py-3 text-sm">
          <summary className="cursor-pointer text-gray-400">{`${rapport.ignores.length} fichier(s) non importé(s)`}</summary>
          <ul className="mt-2 space-y-1 text-xs text-gray-400">
            {rapport.ignores.map((g, i) => (
              <li key={`${g.date}-${g.nom}-${i}`}>{`${g.date} · ${g.nom} — ${g.raison}`}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
