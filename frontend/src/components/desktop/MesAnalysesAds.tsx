import { useEffect, useState } from 'react'
import { ExternalLink, Loader2, X } from 'lucide-react'
import { Markdown } from '../Markdown'
import { dpApi, type AnalyseAds } from '../../lib/desktopPower'

const NOMS: Record<string, string> = {
  investissement: 'Investissement',
  portee: 'Portée',
  debut: 'Diffusée depuis',
  publicitesActives: 'Publicités actives',
  boutique: 'Boutique',
  signesDeVentes: 'Signes de ventes',
  retour: 'Retour',
}

/** Un rapport AdsAnalyser ouvert : le Markdown du modèle, tel quel. */
export function RapportAds({ id, fermer }: { id: string; fermer: () => void }) {
  const [a, setA] = useState<(AnalyseAds & { body: string }) | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  useEffect(() => {
    dpApi
      .analyseAds(id)
      .then((r) => setA(r.analyse))
      .catch((e: Error) => setErreur(e.message))
  }, [id])
  return (
    <section className="case-ds mt-4 p-5">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--marque-rose)]">{a ? (a.plateforme === 'facebook' ? 'Facebook Ad Library' : 'TikTok Ads Library') : 'Analyse'}</p>
          <h2 className="text-base font-extrabold">{a?.titre ?? '…'}</h2>
          {a ? (
            <a href={a.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-gray-400 underline">
              <ExternalLink size={11} /> Page analysée
            </a>
          ) : null}
        </div>
        <button type="button" onClick={fermer} className="rounded-lg p-1.5 text-gray-400 hover:text-white" aria-label="Fermer">
          <X size={16} />
        </button>
      </div>
      {erreur ? <p className="text-xs text-red-300">{erreur}</p> : !a ? <Loader2 size={16} className="animate-spin text-gray-400" /> : <div className="text-sm leading-relaxed"><Markdown texte={a.body} /></div>}
    </section>
  )
}

/**
 * « Mes analyses » : les rapports AdsAnalyser du vendeur, les plus récents
 * d'abord. Montré sur AdsAnalyser et dans Analyses réseaux (filtre « Mes
 * analyses perso »).
 */
export function MesAnalysesAds({ recharger = 0, ouvrirId }: { recharger?: number; ouvrirId?: string | null }) {
  const [liste, setListe] = useState<AnalyseAds[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ouverte, setOuverte] = useState<string | null>(ouvrirId ?? null)
  const [filtre, setFiltre] = useState<'tout' | 'facebook' | 'tiktok'>('tout')

  useEffect(() => {
    dpApi
      .analysesAds()
      .then((r) => setListe(r.analyses))
      .catch((e: Error) => {
        setErreur(e.message)
        setListe([])
      })
  }, [recharger])
  useEffect(() => {
    if (ouvrirId) setOuverte(ouvrirId)
  }, [ouvrirId])

  const affichees = (liste ?? []).filter((a) => filtre === 'tout' || a.plateforme === filtre)

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {(['tout', 'facebook', 'tiktok'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFiltre(f)} className={`rounded-full border px-3 py-1 ${filtre === f ? 'border-[var(--marque-rose)] text-white' : 'border-[var(--trait)] text-gray-400'}`}>
            {f === 'tout' ? 'Toutes' : f === 'facebook' ? 'Facebook' : 'TikTok'}
          </button>
        ))}
      </div>
      {erreur ? <p className="text-xs text-red-300">{erreur}</p> : null}
      {!liste ? (
        <Loader2 size={16} className="animate-spin text-gray-400" />
      ) : !affichees.length ? (
        <p className="text-xs text-gray-400">Aucune analyse encore. Elles se lancent depuis AdsAnalyser, dans l'application desktop.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {affichees.map((a) => (
            <button key={a.id} type="button" onClick={() => setOuverte(a.id)} className={`case-ds p-4 text-left transition hover:border-[var(--marque-rose)] ${ouverte === a.id ? 'border-[var(--marque-rose)]' : ''}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--marque-rose)]">
                {a.plateforme === 'facebook' ? 'Facebook' : 'TikTok'} · {new Date(a.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
              </p>
              <h3 className="mt-1 line-clamp-2 text-sm font-semibold">{a.titre}</h3>
              {a.donnees ? (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {Object.entries(NOMS).map(([cle, nom]) => (
                    <div key={cle} className="contents">
                      <dt className="text-gray-500">{nom}</dt>
                      <dd className="truncate text-gray-200">{a.donnees?.[cle] ?? 'non visible'}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </button>
          ))}
        </div>
      )}
      {ouverte ? <RapportAds id={ouverte} fermer={() => setOuverte(null)} /> : null}
    </div>
  )
}
