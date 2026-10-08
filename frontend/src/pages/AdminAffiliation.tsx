import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { HandCoins, Copy, Check } from 'lucide-react'
import { Layout } from '../components/Layout'
import { useAuth } from '../lib/auth'
import { demoAutorise } from '../lib/demo'
import { api, type AffiliationAdmin } from '../lib/api'
import { euros } from '../lib/affiliation'

type Affilie = AffiliationAdmin['affilies'][number]

/**
 * Les versements aux affiliés — vue ADMIN, réservée au compte de Max.
 *
 * Règle (08/10/2026) : un virement par mois dès 50 € dus. Max fait le virement
 * à sa banque avec l'IBAN affiché, puis clique « Versé » : toutes les
 * commissions dues de l'affilié sont soldées et il reçoit un mail.
 * La vraie sécurité est côté serveur (requireAuth + requireAdmin).
 */
const dateCourte = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const ibanLisible = (iban: string) => iban.replace(/(.{4})/g, '$1 ').trim()

function BoutonCopier({ texte }: { texte: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      title="Copier"
      onClick={() => {
        navigator.clipboard.writeText(texte).then(() => {
          setOk(true)
          setTimeout(() => setOk(false), 1500)
        })
      }}
      className="ml-1.5 inline-flex rounded p-1 text-gray-400 hover:bg-white/10 hover:text-white"
    >
      {ok ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}

function Ligne({ a, seuil, onVerse }: { a: Affilie; seuil: number; onVerse: () => void }) {
  const [reference, setReference] = useState('')
  const [confirmer, setConfirmer] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function verser() {
    setEnvoi(true)
    setErreur(null)
    try {
      await api.affiliationVerse(a.id, reference)
      setConfirmer(false)
      onVerse()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Versement non enregistré')
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <div className={`rounded-xl border p-4 ${a.aVerser ? 'border-emerald-400/40 bg-emerald-400/5' : 'border-white/10 bg-white/5'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {a.nom} <span className="font-mono text-xs text-gray-400">{a.code}</span>
          </p>
          <p className="truncate text-xs text-gray-400">
            {a.email} · inscrit le {dateCourte(a.inscritLe)} · {a.filleuls} filleul(s) · {a.clics} clic(s)
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold tabular-nums">{euros(a.dusCentimes)}</p>
          <p className="text-xs text-gray-400">dû · déjà versé {euros(a.versesCentimes)}</p>
        </div>
      </div>

      <div className="mt-3 text-sm">
        {a.iban ? (
          <p className="text-gray-300">
            <span className="text-gray-400">Virement à </span>
            {a.titulaire}
            <BoutonCopier texte={a.titulaire ?? ''} />
            <span className="ml-2 font-mono">{ibanLisible(a.iban)}</span>
            <BoutonCopier texte={a.iban} />
          </p>
        ) : (
          <p className="text-amber-300">Pas encore d’IBAN : l’affilié doit le saisir dans son espace.</p>
        )}
      </div>

      {a.dusCentimes > 0 && a.iban && (
        <div className="mt-3">
          {!a.aVerser && <p className="mb-2 text-xs text-gray-400">Sous le seuil de {euros(seuil)} : à reporter au mois prochain.</p>}
          {confirmer ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Référence du virement (facultatif)"
                maxLength={120}
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={envoi}
                onClick={verser}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {envoi ? 'Enregistrement…' : `Confirmer : ${euros(a.dusCentimes)} versés`}
              </button>
              <button type="button" onClick={() => setConfirmer(false)} className="text-sm text-gray-400 underline">
                Annuler
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmer(true)}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-sm hover:bg-white/5"
            >
              Versé
            </button>
          )}
          {erreur && <p className="mt-2 text-xs text-red-400">{erreur}</p>}
        </div>
      )}

      {a.versements.length > 0 && (
        <p className="mt-3 text-xs text-gray-500">
          Derniers versements :{' '}
          {a.versements.map((v) => `${euros(v.montantCentimes)} le ${dateCourte(v.createdAt)}${v.reference ? ` (${v.reference})` : ''}`).join(' · ')}
        </p>
      )}
    </div>
  )
}

export default function AdminAffiliation() {
  const { user } = useAuth()
  const estAdmin = demoAutorise(user?.email)
  const [donnees, setDonnees] = useState<AffiliationAdmin | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = useCallback(() => {
    api
      .affiliationAdmin()
      .then((d) => {
        setDonnees(d)
        setErreur(null)
      })
      .catch((err) => setErreur(err instanceof Error ? err.message : 'Chargement impossible'))
  }, [])

  useEffect(() => {
    if (estAdmin) charger()
  }, [estAdmin, charger])

  if (!estAdmin) return <Navigate to="/dashboard" replace />

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <HandCoins size={22} className="text-emerald-400" />
          <span>Versements affiliés</span>
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Un virement par mois dès {donnees ? euros(donnees.seuilCentimes) : '50 €'} dus. Faites le virement à votre banque, puis cliquez « Versé » :
          les commissions sont soldées et l’affilié reçoit un mail.
        </p>
      </div>

      {erreur && <p className="text-sm text-red-400">{erreur}</p>}

      {!donnees ? (
        !erreur && <p className="text-sm text-gray-400">Chargement…</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['À verser ce mois', euros(donnees.totaux.dusAVerserCentimes), `${donnees.totaux.aVerser} affilié(s)`],
              ['Total dû', euros(donnees.totaux.dusCentimes), 'y compris sous le seuil'],
              ['Déjà versé', euros(donnees.totaux.versesCentimes), 'depuis le début'],
              ['Affiliés', String(donnees.totaux.affilies), 'inscrits'],
            ].map(([titre, valeur, detail]) => (
              <div key={titre} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wider text-gray-400">{titre}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{valeur}</p>
                <p className="text-xs text-gray-400">{detail}</p>
              </div>
            ))}
          </div>
          {donnees.affilies.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-gray-400">
              Aucun affilié pour l’instant. Ils s’inscrivent sur /affiliation.
            </p>
          ) : (
            <div className="space-y-3">
              {donnees.affilies.map((a) => (
                <Ligne key={a.id} a={a} seuil={donnees.seuilCentimes} onVerse={charger} />
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
