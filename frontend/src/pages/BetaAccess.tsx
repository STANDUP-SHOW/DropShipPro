import { useEffect, useState } from 'react'
import {
  KeyRound,
  Printer,
  ChevronDown,
  Link2,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  Upload,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import {
  betaApi,
  codeBeta,
  retenirCode,
  oublierCode,
  type FicheImprimerie,
  type ApercuImprimerie,
} from '../lib/beta'

/**
 * Les chantiers ouverts.
 *
 * **Pourquoi une page à part et un code.** Ce qui est ici n'est pas fini. La
 * boutique d'imprimerie repose sur un modèle de prix — une grille
 * `(options × quantité × délai)` au lieu d'un prix — qui n'a jamais servi en
 * vrai, et sur des relevés dont la base juridique n'est pas tranchée. Mêlé au
 * reste de l'application, tout cela se prendrait pour une fonction livrée, et
 * un vendeur bâtirait sa boutique dessus.
 *
 * Le code n'est pas un secret : c'est un garde-fou contre l'ouverture par
 * accident. Il est vérifié par le serveur à chaque requête, pas seulement ici —
 * une page seulement absente du menu reste appelable par son adresse.
 */

const champ =
  'w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none transition focus:border-purple-400/70'

export default function BetaAccess() {
  const [code, setCode] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [verif, setVerif] = useState(false)

  // Le code survit à un changement de page, pas à la fermeture de l'onglet.
  useEffect(() => {
    const garde = codeBeta()
    if (!garde) return
    betaApi
      .unlock(garde)
      .then(() => setOuvert(true))
      .catch(() => oublierCode())
  }, [])

  async function deverrouiller(e: React.FormEvent) {
    e.preventDefault()
    setVerif(true)
    setErreur(null)
    try {
      await betaApi.unlock(code.trim())
      retenirCode(code.trim())
      setOuvert(true)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Code incorrect')
    } finally {
      setVerif(false)
    }
  }

  return (
    <Layout>
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <KeyRound size={22} className="text-purple-300" />
          <span>Autorisation spéciale</span>
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-400">
          Des chantiers en cours, ouverts à l'essai. Rien de ce qui est ici n'est confirmé en
          production : ni les prix, ni les flux, ni la façon dont les fiches sont relevées.
        </p>
      </header>

      {!ouvert ? (
        <form
          onSubmit={deverrouiller}
          className="max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-5"
        >
          <label className="text-xs text-gray-400">Code d'accès</label>
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="••••••"
            className={`${champ} mt-1 tracking-[0.3em]`}
          />
          {erreur ? <p className="mt-2 text-xs text-red-300">{erreur}</p> : null}
          <button
            type="submit"
            disabled={verif || !code.trim()}
            className="btn-gradient mt-4 w-full rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {verif ? 'Vérification…' : 'Déverrouiller'}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <BlocImprimerie />
          <button
            type="button"
            onClick={() => {
              oublierCode()
              setOuvert(false)
              setCode('')
            }}
            className="text-xs text-gray-500 hover:text-white"
          >
            Reverrouiller cette section
          </button>
        </div>
      )}
    </Layout>
  )
}

/** Le module imprimerie, replié comme un fournisseur. */
function BlocImprimerie() {
  const [deplie, setDeplie] = useState(true)
  const [apercu, setApercu] = useState<ApercuImprimerie | null>(null)
  const [fiches, setFiches] = useState<FicheImprimerie[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  async function charger() {
    try {
      const [a, f] = await Promise.all([betaApi.apercu(), betaApi.fiches()])
      setApercu(a)
      setFiches(f)
      setErreur(null)
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Lecture impossible')
    }
  }

  useEffect(() => {
    charger()
  }, [])

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setDeplie((v) => !v)}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-white/[0.05]"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple-500/20">
          <Printer size={17} className="text-purple-200" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Boutique d'imprimerie — Pixartprinting</p>
          <p className="truncate text-[11px] text-gray-500">
            {apercu
              ? `${apercu.total} fiche(s), ${apercu.enLigne} en ligne, ${apercu.lignesTarifaires} ligne(s) tarifaire(s)`
              : 'Chargement…'}
          </p>
        </div>
        <ChevronDown size={16} className={`shrink-0 text-gray-400 ${deplie ? '' : '-rotate-90'}`} />
      </button>

      {deplie ? (
        <div className="space-y-5 border-t border-white/10 p-4">
          <Avertissement />
          {erreur ? (
            <p className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-200">
              {erreur}
            </p>
          ) : null}
          <Boutiques apercu={apercu} />
          <Depot onDepose={charger} />
          <Liste fiches={fiches} boutiques={apercu?.boutiques ?? []} onChange={charger} />
        </div>
      ) : null}
    </section>
  )
}

/**
 * Ce que ce module ne règle pas.
 *
 * Écrit dans l'écran et non dans un mémo : c'est ici que la décision de publier
 * se prend, et une mise en garde qu'il faut aller chercher n'est pas lue.
 */
function Avertissement() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <div className="space-y-1.5">
        <p>
          <strong>Deux points restent à trancher avec le fournisseur</strong>, et ils ne sont pas
          techniques.
        </p>
        <p>
          Ses conditions générales interdisent très probablement l'extraction automatisée et la
          revente du catalogue sans accord — comme presque tout site marchand. Pixartprinting annonce
          des solutions API et un programme professionnel : c'est la voie à demander.
        </p>
        <p>
          Ses photos et ses textes sont protégés. Ce module ne les stocke pas : les vôtres sont
          attendus. Seule la grille de prix, qui est une donnée de fait, est relevée.
        </p>
      </div>
    </div>
  )
}

/** Les boutiques de publication et l'adresse de leur flux. */
function Boutiques({ apercu }: { apercu: ApercuImprimerie | null }) {
  const [copie, setCopie] = useState<string | null>(null)
  if (!apercu) return null

  if (!apercu.boutiques.length) {
    return (
      <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-gray-400">
        Aucune boutique. Créez-en une dans « Mes sites » : c'est elle qui porte l'adresse du flux.
      </p>
    )
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Boutiques de publication
      </p>
      <ul className="mt-2 space-y-2">
        {apercu.boutiques.map((b) => (
          <li key={b.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="flex items-center justify-between gap-2 text-sm font-medium">
              <span>{b.name}</span>
              <span className="text-[11px] text-gray-500">{`${b.enLigne} en ligne`}</span>
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Link2 size={12} className="shrink-0 text-purple-300" />
              <code className="min-w-0 flex-1 truncate rounded bg-black/40 px-2 py-1 text-[11px] text-gray-300">
                {b.feedUrl}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(b.feedUrl)
                  setCopie(b.id)
                  setTimeout(() => setCopie(null), 1500)
                }}
                className="shrink-0 rounded-lg border border-white/10 p-1.5 text-gray-400 hover:bg-white/5"
              >
                {copie === b.id ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
        Le flux rend, pour chaque fiche, un prix d'appel — avec la quantité et le délai qui le
        produisent — et la grille complète, prix de vente marge comprise. Le prix fournisseur ne
        sort jamais.
      </p>
    </div>
  )
}

/**
 * Le dépôt d'un relevé.
 *
 * Un collage de JSON plutôt qu'un bouton « relever » : le relevé se fait
 * dehors, et l'application n'a pas à prétendre le faire tant qu'elle ne le fait
 * pas. L'adresse source sert de clé — relever deux fois la même page corrige la
 * grille au lieu de la dupliquer.
 */
function Depot({ onDepose }: { onDepose: () => void }) {
  const [texte, setTexte] = useState('')
  const [etat, setEtat] = useState<{ ok: boolean; message: string } | null>(null)
  const [envoi, setEnvoi] = useState(false)

  async function deposer() {
    setEnvoi(true)
    setEtat(null)
    try {
      const releve = JSON.parse(texte)
      const lots = Array.isArray(releve) ? releve : [releve]
      let neuves = 0
      let majs = 0
      for (const lot of lots) {
        const res = await betaApi.deposer(lot)
        res.remplacee ? majs++ : neuves++
      }
      setEtat({ ok: true, message: `${neuves} fiche(s) ajoutée(s), ${majs} mise(s) à jour.` })
      setTexte('')
      onDepose()
    } catch (err) {
      setEtat({
        ok: false,
        message:
          err instanceof SyntaxError
            ? "Ce n'est pas du JSON valide."
            : err instanceof Error
              ? err.message
              : 'Dépôt impossible',
      })
    } finally {
      setEnvoi(false)
    }
  }

  async function voirFormat() {
    const exemple = await betaApi.format()
    setTexte(JSON.stringify(exemple, null, 2))
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Déposer un relevé
        </p>
        <button
          type="button"
          onClick={voirFormat}
          className="text-[11px] text-purple-300 hover:underline"
        >
          Voir le format attendu
        </button>
      </div>
      <textarea
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        rows={6}
        placeholder='{"sourceUrl": "…", "name": "…", "dimensions": [...], "priceRows": [...]}'
        className={`${champ} mt-2 font-mono text-[11px]`}
      />
      {etat ? (
        <p className={`mt-2 text-xs ${etat.ok ? 'text-emerald-300' : 'text-red-300'}`}>{etat.message}</p>
      ) : null}
      <button
        type="button"
        onClick={deposer}
        disabled={envoi || !texte.trim()}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs transition hover:bg-white/5 disabled:opacity-40"
      >
        <Upload size={12} />
        <span>{envoi ? 'Dépôt…' : 'Déposer'}</span>
      </button>
      <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">
        Un objet, ou un tableau d'objets pour déposer plusieurs fiches d'un coup. L'adresse source
        fait la clé : redéposer la même page rafraîchit ses prix et laisse intacts votre titre, vos
        photos, votre marge et votre boutique.
      </p>
    </div>
  )
}

/** Les fiches relevées, et ce qu'il leur manque pour partir au flux. */
function Liste({
  fiches,
  boutiques,
  onChange,
}: {
  fiches: FicheImprimerie[]
  boutiques: ApercuImprimerie['boutiques']
  onChange: () => void
}) {
  const [erreur, setErreur] = useState<string | null>(null)

  async function modifier(id: string, champs: Parameters<typeof betaApi.modifier>[1]) {
    try {
      await betaApi.modifier(id, champs)
      setErreur(null)
      onChange()
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Modification impossible')
    }
  }

  if (!fiches.length) {
    return (
      <p className="rounded-xl border border-dashed border-white/15 p-4 text-center text-xs text-gray-500">
        Aucune fiche relevée pour l'instant.
      </p>
    )
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {`Fiches relevées (${fiches.length})`}
      </p>
      {erreur ? <p className="mt-2 text-xs text-red-300">{erreur}</p> : null}
      <ul className="mt-2 space-y-2">
        {fiches.map((f) => (
          <li key={f.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.name}</p>
                <p className="truncate text-[11px] text-gray-500">{f.sourceUrl}</p>
                <p className="mt-1 text-[11px] text-gray-400">
                  {f.grille.lignes
                    ? `${f.dimensions} dimension(s), ${f.grille.lignes} ligne(s) — de ${f.grille.min?.toFixed(2)} € à ${f.grille.max?.toFixed(2)} €`
                    : 'Aucune grille de prix'}
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await betaApi.supprimer(f.id)
                  onChange()
                }}
                className="shrink-0 rounded-lg border border-white/10 p-1.5 text-gray-500 transition hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 size={13} />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-gray-400">
                <span>Marge</span>
                <input
                  type="text"
                  inputMode="decimal"
                  defaultValue={String(f.marginPercent)}
                  onBlur={(e) => {
                    // La virgule du pavé numérique français : `Number('40,5')`
                    // vaut NaN, et la marge partirait à zéro sans un mot.
                    const valeur = Number(e.target.value.replace(',', '.'))
                    if (Number.isFinite(valeur) && valeur !== f.marginPercent) {
                      modifier(f.id, { marginPercent: valeur })
                    }
                  }}
                  className="w-16 rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-xs outline-none focus:border-purple-400/70"
                />
                <span>%</span>
              </label>

              <select
                value={f.shopId ?? ''}
                onChange={(e) => modifier(f.id, { shopId: e.target.value || null })}
                className="rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-xs outline-none focus:border-purple-400/70"
              >
                <option value="">Aucune boutique</option>
                {boutiques.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              {f.manque.length ? (
                <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-200">
                  {`Il manque ${f.manque.join(', ')}`}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => modifier(f.id, { active: !f.active })}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] transition ${
                    f.active
                      ? 'bg-emerald-400/15 text-emerald-300'
                      : 'border border-white/15 text-gray-400 hover:bg-white/5'
                  }`}
                >
                  {f.active ? 'En ligne' : 'Mettre en ligne'}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
