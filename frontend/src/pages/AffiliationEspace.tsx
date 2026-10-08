import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { affiliationApi, deconnecterAffilie, euros, jetonAffilie, type Periode, type Tableau } from '../lib/affiliation'
import { CadreAffiliation } from './AffiliationAccueil'

/** Le tableau de bord de l'affilié : son lien, ses chiffres, ses filleuls. */

const PERIODES: Array<[Periode, string]> = [
  ['jour', 'Jour'],
  ['semaine', 'Semaine'],
  ['mois', 'Mois'],
  ['annee', 'Année'],
]

type Mesure = 'gainsCentimes' | 'depensesCentimes' | 'clics' | 'inscriptions'
const MESURES: Array<[Mesure, string]> = [
  ['gainsCentimes', 'Gains'],
  ['depensesCentimes', 'Dépenses des filleuls'],
  ['clics', 'Clics'],
  ['inscriptions', 'Inscriptions'],
]

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const pourcent = (x: number) => `${(x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`

function Versements({ t, onMaj }: { t: Tableau; onMaj: () => void }) {
  const p = t.paiement
  const [edition, setEdition] = useState(!p.ibanMasque)
  const [titulaire, setTitulaire] = useState(p.titulaire ?? '')
  const [iban, setIban] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  async function enregistrer(e: FormEvent) {
    e.preventDefault()
    setEnvoi(true)
    setErreur(null)
    try {
      await affiliationApi.enregistrerIban(titulaire, iban)
      setIban('')
      setEdition(false)
      onMaj()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setEnvoi(false)
    }
  }

  const reste = Math.max(0, p.seuilCentimes - t.totaux.dusCentimes)
  return (
    <section className="mt-8 grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <h2 className="text-lg font-bold">Vos versements</h2>
        <p className="mt-1 text-sm text-gray-300">
          Un virement par mois dès {euros(p.seuilCentimes)} dus.{' '}
          {reste > 0 ? `Encore ${euros(reste)} avant le prochain virement.` : 'Votre prochain virement partira ce mois-ci.'}
        </p>
        {p.versements.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Aucun versement pour l’instant.</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/5 text-sm">
            {p.versements.map((v) => (
              <li key={v.id} className="flex justify-between py-2">
                <span className="text-gray-300">{date(v.createdAt)}</span>
                <span className="font-semibold tabular-nums text-emerald-300">{euros(v.montantCentimes)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <h2 className="text-lg font-bold">Compte bancaire</h2>
        {!edition && p.ibanMasque ? (
          <div className="mt-2 text-sm text-gray-300">
            <p>{p.titulaire}</p>
            <p className="font-mono">{p.ibanMasque}</p>
            <p className="mt-1 text-xs text-gray-500">Enregistré le {date(p.ibanMajLe)}</p>
            <button onClick={() => setEdition(true)} className="mt-3 text-sm underline hover:text-white">
              Changer de compte
            </button>
          </div>
        ) : (
          <form onSubmit={enregistrer} className="mt-2 space-y-3">
            {!p.ibanMasque && <p className="text-sm text-amber-300">Indiquez votre IBAN pour recevoir vos commissions.</p>}
            {erreur && <p className="text-sm text-red-400">{erreur}</p>}
            <label className="block text-sm text-gray-300">
              Titulaire du compte
              <input
                value={titulaire}
                onChange={(e) => setTitulaire(e.target.value)}
                required
                minLength={2}
                maxLength={100}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white outline-none focus:border-orange-300/60"
              />
            </label>
            <label className="block text-sm text-gray-300">
              IBAN
              <input
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
                required
                maxLength={50}
                placeholder="FR76 …"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-white outline-none focus:border-orange-300/60"
              />
            </label>
            <div className="flex items-center gap-3">
              <button disabled={envoi} className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50">
                {envoi ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              {p.ibanMasque && (
                <button type="button" onClick={() => setEdition(false)} className="text-sm text-gray-400 underline">
                  Annuler
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  )
}

function Carte({ titre, valeur, detail }: { titre: string; valeur: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wider text-gray-400">{titre}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{valeur}</p>
      {detail && <p className="mt-0.5 text-xs text-gray-400">{detail}</p>}
    </div>
  )
}

export default function AffiliationEspace() {
  const navigate = useNavigate()
  const [periode, setPeriode] = useState<Periode>('jour')
  const [mesure, setMesure] = useState<Mesure>('gainsCentimes')
  const [filtre, setFiltre] = useState<'tous' | 'actifs' | 'inactifs'>('tous')
  const [t, setT] = useState<Tableau | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [copie, setCopie] = useState(false)

  const charger = useCallback(async () => {
    try {
      setT(await affiliationApi.tableau(periode))
      setErreur(null)
    } catch (err) {
      if ((err as { status?: number }).status === 401) {
        deconnecterAffilie()
        navigate('/affiliation/connexion')
        return
      }
      setErreur(err instanceof Error ? err.message : 'Chargement impossible')
    }
  }, [periode, navigate])

  useEffect(() => {
    if (!jetonAffilie()) navigate('/affiliation/connexion')
    else charger()
  }, [charger, navigate])

  if (!t) {
    return (
      <CadreAffiliation>
        <p className="mt-16 text-center text-gray-400">{erreur ?? 'Chargement de votre espace…'}</p>
      </CadreAffiliation>
    )
  }

  const lien = `${t.lien}${t.affilie.code}`
  const max = Math.max(1, ...t.series.map((s) => s[mesure]))
  const enEuros = mesure === 'gainsCentimes' || mesure === 'depensesCentimes'
  const valeur = (v: number) => (enEuros ? euros(v) : v.toLocaleString('fr-FR'))
  const totalPeriode = t.series.reduce((a, s) => a + s[mesure], 0)
  const filleuls = t.filleuls.filter((f) => filtre === 'tous' || (filtre === 'actifs' ? f.actif : !f.actif))

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien)
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {
      /* le lien reste sélectionnable à la main */
    }
  }

  return (
    <CadreAffiliation>
      <div className="flex flex-wrap items-end justify-between gap-3 pt-4">
        <div>
          <p className="text-sm text-gray-400">Espace affilié</p>
          <h1 className="text-2xl font-bold sm:text-3xl">Bonjour {t.affilie.nom}</h1>
        </div>
        <button
          onClick={() => {
            deconnecterAffilie()
            navigate('/affiliation/connexion')
          }}
          className="text-sm text-gray-400 underline hover:text-white"
        >
          Se déconnecter
        </button>
      </div>
      {erreur && <p className="mt-3 text-sm text-red-400">{erreur}</p>}

      <section className="mt-6 rounded-2xl border border-orange-300/30 bg-gradient-to-r from-[#f28a4b1a] to-[#e852901a] p-4 sm:p-5">
        <p className="text-sm font-semibold">Votre lien à partager</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input readOnly value={lien} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-sm" />
          <button onClick={copier} className="btn-gradient rounded-lg px-4 py-2 text-sm font-semibold">
            {copie ? 'Copié' : 'Copier le lien'}
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Il marche sur toutes les pages du site : ajoutez <span className="font-mono">?parrain={t.affilie.code}</span> à n’importe quelle adresse
          drop-shipper.fr. Le visiteur garde votre lien 30 jours.
        </p>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Carte titre="Gains totaux" valeur={euros(t.totaux.gainsCentimes)} detail={`${pourcent(t.taux)} à vie`} />
        <Carte titre="À verser" valeur={euros(t.totaux.dusCentimes)} detail={`Déjà versé : ${euros(t.totaux.versesCentimes)}`} />
        <Carte titre="Clics" valeur={t.totaux.clics.toLocaleString('fr-FR')} detail={`Conversion : ${pourcent(t.totaux.conversion)}`} />
        <Carte
          titre="Filleuls"
          valeur={t.totaux.inscriptions.toLocaleString('fr-FR')}
          detail={`${t.totaux.filleulsActifs} actifs · ${t.totaux.filleulsPayants} payants`}
        />
      </section>
      <p className="mt-2 text-xs text-gray-500">Dépenses cumulées de vos filleuls : {euros(t.totaux.depensesCentimes)}.</p>

      <section className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {MESURES.map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMesure(m)}
                className={`rounded-full px-3 py-1 text-xs ${mesure === m ? 'bg-white text-gray-900' : 'border border-white/15 text-gray-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-lg border border-white/10 p-0.5">
            {PERIODES.map(([p, label]) => (
              <button key={p} onClick={() => setPeriode(p)} className={`rounded-md px-2.5 py-1 text-xs ${periode === p ? 'bg-white/15 text-white' : 'text-gray-400'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-4 text-sm text-gray-300">
          Sur la période affichée : <b className="text-white">{valeur(totalPeriode)}</b>
        </p>
        <div className="mt-3 flex h-44 items-end gap-[3px]" role="img" aria-label={`${MESURES.find(([m]) => m === mesure)?.[1]} par ${periode}`}>
          {t.series.map((s) => (
            <div key={s.cle} className="group relative flex h-full flex-1 items-end">
              <div
                className="w-full rounded-t bg-gradient-to-t from-[#f28a4b] to-[#e85290] opacity-90 group-hover:opacity-100"
                style={{ height: `${s[mesure] ? Math.max(3, (s[mesure] / max) * 100) : 0}%` }}
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[11px] group-hover:block">
                {s.libelle} : {valeur(s[mesure])}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-gray-500">
          <span>{t.series[0]?.libelle}</span>
          <span>{t.series[t.series.length - 1]?.libelle}</span>
        </div>
      </section>

      <Versements t={t} onMaj={charger} />

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Vos filleuls</h2>
          <div className="flex gap-1 rounded-lg border border-white/10 p-0.5 text-xs">
            {(['tous', 'actifs', 'inactifs'] as const).map((f) => (
              <button key={f} onClick={() => setFiltre(f)} className={`rounded-md px-2.5 py-1 capitalize ${filtre === f ? 'bg-white/15 text-white' : 'text-gray-400'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-500">Actif : une recharge ou une action sur son compte depuis moins de {t.joursActif} jours.</p>
        {filleuls.length === 0 ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-400">
            {t.filleuls.length === 0 ? 'Aucun filleul pour l’instant. Partagez votre lien pour commencer.' : 'Aucun filleul dans ce filtre.'}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-white/5">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs text-gray-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Filleul</th>
                  <th className="px-4 py-2.5 font-medium">Inscrit le</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                  <th className="px-4 py-2.5 text-right font-medium">Recharges</th>
                  <th className="px-4 py-2.5 text-right font-medium">Dépensé</th>
                  <th className="px-4 py-2.5 text-right font-medium">Vos gains</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filleuls.map((f) => (
                  <tr key={f.id}>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-200">{f.email}</td>
                    <td className="px-4 py-2.5 text-gray-300">{date(f.inscritLe)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${f.actif ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-gray-400'}`}>
                        {f.actif ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{f.recharges}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{euros(f.depensesCentimes)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-emerald-300">{euros(f.gainsCentimes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-10 text-xs text-gray-500">
        Une question sur vos versements : <a href="/contact/" className="underline">contactez-nous</a>. Les conditions du programme sont dans les{' '}
        <Link to="/cgu/#affiliation" className="underline" reloadDocument>
          CGU
        </Link>
        .
      </p>
    </CadreAffiliation>
  )
}
