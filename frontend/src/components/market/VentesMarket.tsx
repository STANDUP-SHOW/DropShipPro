import { useCallback, useEffect, useState } from 'react'
import { FileText, RotateCcw, Undo2, Receipt } from 'lucide-react'
import { apiRoot, getToken } from '../../lib/api'

/**
 * « Mes ventes » du vendeur DropShop Market : ses factures (émises à son nom),
 * le remboursement en un clic et la réponse aux demandes de retour.
 *
 * Own fetch helper on purpose: the shared api.ts belongs to another screen.
 */

interface Identite {
  raisonSociale?: string
  adresse?: string
  siret?: string
  regime?: 'franchise' | 'assujetti'
  taux?: number | null
  tva?: string | null
  mentions?: string | null
}

interface Retour {
  id: string
  statut: 'DEMANDE' | 'ACCEPTE' | 'REFUSE' | 'REMBOURSE'
  statutLibelle: string
  motif: string
  message: string | null
  reponse: string | null
  adresseRetour: string | null
  demandeLe: string
}

interface Vente {
  id: string
  numero: string | null
  titre: string
  variante: string | null
  quantite: number
  montant: number
  commission: number
  acheteur: string | null
  email: string | null
  payeeLe: string
  statut: string
  suivi: string | null
  partVersee: boolean
  facture: string | null
  avoir: string | null
  rembourseLe: string | null
  retour: Retour | null
}

interface Donnees {
  identite: Identite | null
  identiteComplete: boolean
  ventes: Vente[]
}

const euros = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '')

async function appel<T>(chemin: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${apiRoot}/api/market${chemin}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}`, ...(init.headers ?? {}) },
  })
  const corps = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((corps as { error?: string }).error || 'Action impossible pour le moment.')
  return corps as T
}

/** Ouvre la facture dans un onglet : la page est protégée, on la lit puis on l'affiche en blob. */
async function ouvrirFacture(id: string, type: 'facture' | 'avoir') {
  const onglet = window.open('', '_blank')
  try {
    const r = await fetch(`${apiRoot}/api/market/vendeur/commandes/${id}/facture?type=${type}`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || 'Facture introuvable.')
    const url = URL.createObjectURL(new Blob([await r.text()], { type: 'text/html' }))
    if (onglet) onglet.location.href = url
    else window.location.href = url
  } catch (e) {
    onglet?.close()
    throw e
  }
}

const champ = 'w-full rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-violet-400'

function FormulaireIdentite({ identite, complete, onEnregistre }: { identite: Identite | null; complete: boolean; onEnregistre: () => void }) {
  const [ouvert, setOuvert] = useState(!complete)
  const [f, setF] = useState<Identite>({ regime: 'franchise', ...(identite ?? {}) })
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null)
  const [enCours, setEnCours] = useState(false)

  const enregistrer = async () => {
    setEnCours(true)
    setMessage(null)
    try {
      await appel('/vendeur/facturation', { method: 'PUT', body: JSON.stringify({ identite: f }) })
      setMessage({ ok: true, texte: 'Identité enregistrée : vos prochaines ventes sont facturées automatiquement.' })
      setOuvert(false)
      onEnregistre()
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : 'Enregistrement impossible.' })
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Receipt size={16} className="text-violet-300" />
        <span className="flex-1 text-sm">
          {complete ? (
            <>Factures émises à votre nom : <b>{identite?.raisonSociale}</b>, SIRET {identite?.siret}.</>
          ) : (
            <>Sur le Market, c'est vous qui vendez : les factures sont émises <b>à votre nom</b>. Renseignez votre identité de facturation pour qu'elles partent automatiquement à chaque vente.</>
          )}
        </span>
        <button type="button" onClick={() => setOuvert((v) => !v)} className="rounded-lg border border-white/15 px-3 py-1 text-xs hover:bg-white/10">
          {ouvert ? 'Fermer' : complete ? 'Modifier' : 'Renseigner'}
        </button>
      </div>
      {ouvert && (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <input className={champ} placeholder="Nom et prénom, ou raison sociale" value={f.raisonSociale ?? ''} onChange={(e) => setF({ ...f, raisonSociale: e.target.value })} />
          <input className={champ} placeholder="SIRET (14 chiffres)" inputMode="numeric" value={f.siret ?? ''} onChange={(e) => setF({ ...f, siret: e.target.value })} />
          <textarea className={`${champ} md:col-span-2`} rows={2} placeholder="Adresse complète (rue, code postal, ville)" value={f.adresse ?? ''} onChange={(e) => setF({ ...f, adresse: e.target.value })} />
          <select className={champ} value={f.regime} onChange={(e) => setF({ ...f, regime: e.target.value as Identite['regime'] })}>
            <option value="franchise">Franchise en base de TVA (micro-entreprise)</option>
            <option value="assujetti">Assujetti à la TVA</option>
          </select>
          {f.regime === 'assujetti' ? (
            <div className="flex gap-2">
              <select className={champ} value={String(f.taux ?? '')} onChange={(e) => setF({ ...f, taux: Number(e.target.value) })}>
                <option value="">Taux de TVA</option>
                {[20, 10, 5.5, 2.1].map((t) => (
                  <option key={t} value={t}>{String(t).replace('.', ',')} %</option>
                ))}
              </select>
              <input className={champ} placeholder="N° TVA (FR…)" value={f.tva ?? ''} onChange={(e) => setF({ ...f, tva: e.target.value })} />
            </div>
          ) : (
            <p className="self-center text-xs text-gray-400">Vos factures portent « TVA non applicable, art. 293 B du CGI ».</p>
          )}
          <input className={`${champ} md:col-span-2`} placeholder="Mentions en pied de facture (facultatif : forme juridique, capital, RCS…)" value={f.mentions ?? ''} onChange={(e) => setF({ ...f, mentions: e.target.value })} />
          <div className="md:col-span-2">
            <button type="button" disabled={enCours} onClick={enregistrer} className="btn-dropshop rounded-full px-5 py-2 text-sm font-bold text-white">
              Enregistrer
            </button>
          </div>
        </div>
      )}
      {message && <p className={`mt-2 text-sm ${message.ok ? 'text-violet-300' : 'text-red-300'}`}>{message.texte}</p>}
    </div>
  )
}

function ReponseRetour({ vente, onFait }: { vente: Vente; onFait: (texte: string) => void }) {
  const r = vente.retour!
  const [mode, setMode] = useState<'accepter' | 'refuser' | null>(null)
  const [adresse, setAdresse] = useState('')
  const [message, setMessage] = useState('')
  const [erreur, setErreur] = useState('')
  const [enCours, setEnCours] = useState(false)

  const envoyer = async () => {
    setEnCours(true)
    setErreur('')
    try {
      await appel(`/vendeur/retours/${r.id}`, { method: 'POST', body: JSON.stringify({ action: mode, adresse, message }) })
      onFait(mode === 'accepter' ? "Retour accepté : l'acheteur a reçu l'adresse de retour par email." : "Refus envoyé à l'acheteur par email.")
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Réponse impossible.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/[0.05] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <RotateCcw size={14} className="text-amber-300" />
        <span className="font-semibold">Retour {r.statutLibelle.toLowerCase()}</span>
        <span className="text-gray-400">· {r.motif} · le {date(r.demandeLe)}</span>
      </div>
      {r.message && <p className="mt-1 text-gray-300">« {r.message} »</p>}
      {r.reponse && <p className="mt-1 text-gray-400">Votre réponse : « {r.reponse} »</p>}
      {r.adresseRetour && <p className="mt-1 whitespace-pre-line text-gray-400">Adresse de retour : {r.adresseRetour}</p>}
      {r.statut === 'DEMANDE' && !mode && (
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={() => setMode('accepter')} className="rounded-lg bg-violet-500 px-3 py-1 text-xs font-bold text-white">Accepter le retour</button>
          <button type="button" onClick={() => setMode('refuser')} className="rounded-lg border border-white/15 px-3 py-1 text-xs hover:bg-white/10">Refuser</button>
        </div>
      )}
      {mode && (
        <div className="mt-2 space-y-2">
          {mode === 'accepter' && <textarea className={champ} rows={2} placeholder="Adresse où l'acheteur renvoie le colis" value={adresse} onChange={(e) => setAdresse(e.target.value)} />}
          <textarea className={champ} rows={2} placeholder={mode === 'accepter' ? "Message à l'acheteur (facultatif)" : "Pourquoi refusez-vous ? L'acheteur le reçoit par email."} value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" disabled={enCours} onClick={envoyer} className="rounded-lg bg-violet-500 px-3 py-1 text-xs font-bold text-white">Envoyer</button>
            <button type="button" onClick={() => setMode(null)} className="rounded-lg border border-white/15 px-3 py-1 text-xs hover:bg-white/10">Annuler</button>
          </div>
          {mode === 'accepter' && <p className="text-xs text-gray-400">Quand le colis revient (ou sur preuve d'envoi), remboursez en un clic ci-dessus. La loi vous laisse 14 jours après la demande.</p>}
        </div>
      )}
      {erreur && <p className="mt-1 text-red-300">{erreur}</p>}
    </div>
  )
}

export function VentesMarket() {
  const [donnees, setDonnees] = useState<Donnees | null>(null)
  const [erreur, setErreur] = useState('')
  const [info, setInfo] = useState('')
  const [enCours, setEnCours] = useState<string | null>(null)

  const charger = useCallback(() => {
    appel<Donnees>('/vendeur/ventes').then(setDonnees).catch((e) => setErreur(e instanceof Error ? e.message : 'Chargement impossible'))
  }, [])
  useEffect(charger, [charger])

  const agir = async (id: string, action: () => Promise<string>) => {
    setEnCours(id)
    setErreur('')
    setInfo('')
    try {
      setInfo(await action())
      charger()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Action impossible.')
    } finally {
      setEnCours(null)
    }
  }

  const emettre = (v: Vente) =>
    agir(v.id, async () => {
      const { numero } = await appel<{ numero: string }>(`/vendeur/commandes/${v.id}/facture`, { method: 'POST' })
      return `Facture ${numero} émise.`
    })

  const rembourser = (v: Vente) => {
    if (!window.confirm(`Rembourser ${euros(v.montant)} à ${v.acheteur ?? "l'acheteur"} ?\n\nL'acheteur est recrédité sur sa carte (5 à 10 jours ouvrés)${v.partVersee ? ', votre part déjà versée est reprise sur votre compte Stripe' : ''} et DropShop Market renonce à sa commission. Un avoir est émis si la vente était facturée.`)) return
    agir(v.id, async () => {
      await appel(`/vendeur/commandes/${v.id}/rembourser`, { method: 'POST' })
      return "Remboursement effectué : l'acheteur est prévenu par email."
    })
  }

  const voir = (v: Vente, type: 'facture' | 'avoir') => agir(v.id, async () => (await ouvrirFacture(v.id, type), ''))

  const retoursOuverts = donnees?.ventes.filter((v) => v.retour?.statut === 'DEMANDE').length ?? 0

  return (
    <div>
      {donnees && <FormulaireIdentite identite={donnees.identite} complete={donnees.identiteComplete} onEnregistre={charger} />}
      {retoursOuverts > 0 && (
        <p className="mb-3 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
          {retoursOuverts} demande{retoursOuverts > 1 ? 's' : ''} de retour attend{retoursOuverts > 1 ? 'ent' : ''} votre réponse.
        </p>
      )}
      {info && <p className="mb-2 text-sm text-violet-300">{info}</p>}
      {erreur && <p className="mb-2 text-sm text-red-300">{erreur}</p>}
      {!donnees && !erreur && <p className="text-sm text-gray-400">Chargement…</p>}
      {donnees && donnees.ventes.length === 0 && <p className="text-sm text-gray-400">Aucune vente pour le moment.</p>}
      {donnees?.ventes.map((v) => {
        const rembourse = v.statut === 'REFUNDED'
        return (
          <div key={v.id} className="border-t border-white/10 py-3 text-sm first:border-t-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1 truncate">
                {v.quantite} × {v.titre}
                {v.variante ? ` (${v.variante})` : ''}
              </span>
              <span className="text-gray-400">{v.acheteur}</span>
              <span className={rembourse ? 'text-gray-500 line-through' : ''}>{euros(v.montant)}</span>
              {!rembourse && <span className="text-gray-400">−{euros(v.commission)}</span>}
              <span className="text-gray-400">{date(v.payeeLe)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {v.numero && <span className="text-gray-500">{v.numero}</span>}
              {rembourse ? (
                <span className="rounded bg-white/10 px-2 py-0.5">Remboursée le {date(v.rembourseLe)}</span>
              ) : (
                <span className="rounded bg-white/10 px-2 py-0.5">{v.partVersee ? 'Part versée' : 'Part mise de côté'}</span>
              )}
              {v.suivi && <span className="text-gray-400">Suivi {v.suivi}</span>}
              <span className="flex-1" />
              {v.facture ? (
                <button type="button" disabled={enCours === v.id} onClick={() => voir(v, 'facture')} className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 hover:bg-white/10">
                  <FileText size={13} /> Facture {v.facture}
                </button>
              ) : (
                !rembourse && (
                  <button type="button" disabled={enCours === v.id || !donnees.identiteComplete} title={donnees.identiteComplete ? '' : "Renseignez d'abord votre identité de facturation"} onClick={() => emettre(v)} className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 hover:bg-white/10 disabled:opacity-40">
                    <FileText size={13} /> Émettre la facture
                  </button>
                )
              )}
              {v.avoir && (
                <button type="button" disabled={enCours === v.id} onClick={() => voir(v, 'avoir')} className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 hover:bg-white/10">
                  <FileText size={13} /> Avoir {v.avoir}
                </button>
              )}
              {!rembourse && (
                <button type="button" disabled={enCours === v.id} onClick={() => rembourser(v)} className="flex items-center gap-1 rounded-lg border border-red-400/40 px-2.5 py-1 text-red-200 hover:bg-red-400/10">
                  <Undo2 size={13} /> Rembourser
                </button>
              )}
            </div>
            {v.retour && <ReponseRetour vente={v} onFait={(t) => (setInfo(t), charger())} />}
          </div>
        )
      })}
    </div>
  )
}
