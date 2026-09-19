import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, FileUp, Plus, Star, Trash2 } from 'lucide-react'
import { api, type AvisAcheteur, type SyntheseAvis } from '../lib/api'

/**
 * Les avis d'acheteurs d'une annonce.
 *
 * Trois entrées : l'extension les relève sur la fiche du fournisseur au moment
 * de l'import, le vendeur dépose un fichier CSV à trois colonnes (stars, User,
 * Avis), ou il en saisit un. L'origine reste affichée sur chaque avis : un avis
 * recueilli ailleurs se présente comme tel sur la boutique.
 */

function Etoiles({ note, taille = 14 }: { note: number; taille?: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${note} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={taille}
          className={n <= note ? 'fill-amber-400 text-amber-400' : 'text-gray-600'}
          strokeWidth={1.5}
        />
      ))}
    </span>
  )
}

const ORIGINE: Record<string, string> = { extension: 'Relevé sur la fiche', csv: 'Fichier CSV', manuel: 'Saisi à la main' }

export function AvisAcheteurs({ productId }: { productId: string }) {
  const [avis, setAvis] = useState<AvisAcheteur[]>([])
  const [synthese, setSynthese] = useState<SyntheseAvis | null>(null)
  const [message, setMessage] = useState<{ ton: 'ok' | 'erreur'; texte: string; details?: string[] } | null>(null)
  const [occupe, setOccupe] = useState(false)
  const [saisie, setSaisie] = useState(false)
  const [brouillon, setBrouillon] = useState({ stars: 5, author: '', text: '' })
  const fichier = useRef<HTMLInputElement>(null)

  async function charger() {
    const r = await api.avisProduit(productId)
    setAvis(r.avis)
    setSynthese(r.synthese)
  }

  useEffect(() => {
    charger().catch(() => setMessage({ ton: 'erreur', texte: 'Les avis ne se chargent pas.' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  async function agir(action: () => Promise<void>) {
    setOccupe(true)
    setMessage(null)
    try {
      await action()
      await charger()
    } catch (err) {
      setMessage({ ton: 'erreur', texte: err instanceof Error ? err.message : 'Action impossible' })
    } finally {
      setOccupe(false)
    }
  }

  function deposer(f: File | undefined) {
    if (!f) return
    agir(async () => {
      const r = await api.avisImporter(productId, f)
      const bilan = [
        `${r.ajoutes} avis ajouté${r.ajoutes > 1 ? 's' : ''}`,
        r.dejaPresents ? `${r.dejaPresents} déjà présent${r.dejaPresents > 1 ? 's' : ''}` : '',
        r.refus.length ? `${r.refus.length} ligne${r.refus.length > 1 ? 's' : ''} refusée${r.refus.length > 1 ? 's' : ''}` : '',
      ]
        .filter(Boolean)
        .join(', ')
      setMessage({ ton: 'ok', texte: `${bilan}.`, details: r.refus.slice(0, 8) })
    })
    if (fichier.current) fichier.current.value = ''
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {synthese?.moyenne ? (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tabular-nums">{synthese.moyenne.toLocaleString('fr-FR')}</span>
            <div>
              <Etoiles note={Math.round(synthese.moyenne)} />
              <p className="text-[11px] text-gray-400">
                {synthese.nombre} avis affiché{synthese.nombre > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Aucun avis pour l'instant.</p>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          <input
            ref={fichier}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => deposer(e.target.files?.[0])}
          />
          <button
            type="button"
            disabled={occupe}
            onClick={() => fichier.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium hover:bg-white/[0.1] disabled:opacity-50"
          >
            <FileUp size={14} /> Importer un CSV
          </button>
          <button
            type="button"
            disabled={occupe}
            onClick={() => setSaisie((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium hover:bg-white/[0.1] disabled:opacity-50"
          >
            <Plus size={14} /> Ajouter un avis
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
        Fichier CSV à trois colonnes : <code className="text-gray-300">stars</code> (1 à 5),{' '}
        <code className="text-gray-300">User</code> (le nom affiché), <code className="text-gray-300">Avis</code> (le texte).
        Séparateur virgule ou point-virgule, export Excel accepté. Redéposer le même fichier ne double rien. L'extension
        relève aussi les avis affichés sur la fiche du fournisseur au moment de l'import.
      </p>

      {message && (
        <div
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
            message.ton === 'ok' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-red-400/30 bg-red-500/10 text-red-200'
          }`}
        >
          {message.texte}
          {message.details?.length ? (
            <ul className="mt-1 list-disc pl-4 text-[11px] opacity-90">
              {message.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {saisie && (
        <form
          className="mt-3 grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3"
          onSubmit={(e) => {
            e.preventDefault()
            agir(async () => {
              await api.avisAjouter(productId, brouillon)
              setBrouillon({ stars: 5, author: '', text: '' })
              setSaisie(false)
            })
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setBrouillon({ ...brouillon, stars: n })} aria-label={`${n} sur 5`}>
                  <Star size={20} className={n <= brouillon.stars ? 'fill-amber-400 text-amber-400' : 'text-gray-600'} strokeWidth={1.5} />
                </button>
              ))}
            </div>
            <input
              value={brouillon.author}
              onChange={(e) => setBrouillon({ ...brouillon, author: e.target.value })}
              placeholder="Nom affiché"
              maxLength={80}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm"
            />
          </div>
          <textarea
            value={brouillon.text}
            onChange={(e) => setBrouillon({ ...brouillon, text: e.target.value })}
            placeholder="Le texte de l'avis, tel que l'acheteur l'a écrit"
            rows={3}
            required
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
          <button type="submit" disabled={occupe || brouillon.text.trim().length < 2} className="btn-gradient justify-self-start rounded-lg px-4 py-1.5 text-xs font-semibold disabled:opacity-50">
            Enregistrer l'avis
          </button>
        </form>
      )}

      {avis.length > 0 && (
        <>
          <ul className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {avis.map((a) => (
              <li key={a.id} className={`rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 ${a.published ? '' : 'opacity-50'}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <Etoiles note={a.stars} taille={12} />
                      <span className="text-sm font-semibold">{a.author}</span>
                      <span className="text-[11px] text-gray-500">
                        {ORIGINE[a.source] ?? a.source}
                        {a.sourceSite ? ` · ${a.sourceSite}` : ''}
                        {a.reviewedAt ? ` · ${new Date(a.reviewedAt).toLocaleDateString('fr-FR')}` : ''}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-gray-200">{a.text}</p>
                    {a.photos?.length ? (
                      <div className="mt-2 flex gap-1.5 overflow-x-auto">
                        {a.photos.map((p) => (
                          <img key={p} src={p} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={occupe}
                    title={a.published ? 'Masquer sur la boutique' : 'Afficher sur la boutique'}
                    onClick={() => agir(() => api.avisPublier(productId, a.id, !a.published).then(() => undefined))}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-white/10 hover:text-white"
                  >
                    {a.published ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                  <button
                    type="button"
                    disabled={occupe}
                    title="Supprimer cet avis"
                    onClick={() => agir(() => api.avisRetirer(productId, a.id).then(() => undefined))}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-red-500/15 hover:text-red-300"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={occupe}
            onClick={() => {
              if (window.confirm(`Supprimer les ${avis.length} avis de cette annonce ?`)) {
                agir(() => api.avisRetirer(productId, 'tous').then(() => undefined))
              }
            }}
            className="mt-3 text-[11px] text-gray-500 underline-offset-2 hover:text-red-300 hover:underline"
          >
            Tout supprimer pour repartir d'un fichier corrigé
          </button>
        </>
      )}
    </div>
  )
}
