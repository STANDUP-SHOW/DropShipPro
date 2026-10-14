import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Layout } from '../components/Layout'
import { BandeauMCP } from '../components/BandeauMCP'
import { SupplierBlock } from '../components/SupplierBlock'
import { StatsFournisseurs } from '../components/fournisseurs/StatsFournisseurs'
import { BlocSacha } from '../components/fournisseurs/BlocSacha'
import { api } from '../lib/api'

/**
 * Fournisseurs : d'où viennent les produits, et comment on s'y relie.
 *
 * **Refaite le 14/10/2026 à la demande de Max**, d'après sa maquette :
 * - en haut, le bloc statistique réduit (demi-page, grand graphique, petits
 *   chiffres, dépliable) et, à sa droite, l'information MCP ;
 * - la liste complète des fournisseurs, trois par ligne, avec un seul bloc de
 *   tri groupé ;
 * - en bas, Sacha (récap de sa fiche, discussion, champ pour écrire ou
 *   dicter) et, à côté, la demande d'un fournisseur manquant.
 *
 * Les ventes à commander ne sont plus ici : elles ont leur rubrique,
 * « Commandes fournisseurs ». Il en reste le badge « à commander » sur la
 * carte du fournisseur concerné.
 */

type Supplier = Awaited<ReturnType<typeof api.listSuppliers>>[number]
type Lien = Awaited<ReturnType<typeof api.listSupplierLinks>>[number]
type ParFournisseur = Awaited<ReturnType<typeof api.ordersBySupplier>>['fournisseurs'][number]

type Filtre = 'tous' | 'api' | 'relies' | 'sans-api'

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [liens, setLiens] = useState<Lien[]>([])
  const [ouvert, setOuvert] = useState<string | null>(null)
  const [ventes, setVentes] = useState<ParFournisseur[]>([])
  const [filtre, setFiltre] = useState<Filtre>('tous')

  const recharger = () => {
    api.listSupplierLinks().then(setLiens).catch(() => undefined)
    api
      .ordersBySupplier()
      .then((r) => setVentes(r.fournisseurs))
      .catch(() => undefined)
  }

  useEffect(() => {
    api.listSuppliers().then(setSuppliers).catch(() => undefined)
    recharger()
  }, [])

  const lienDe = (id: string) => liens.find((l) => l.supplier === id)
  const estRelie = (id: string) => Boolean(lienDe(id)?.connected)

  /** Les fournisseurs classés : ceux qu'on peut relier d'abord. */
  const classes = useMemo(
    () => [...suppliers].sort((a, b) => Number(Boolean(b.api)) - Number(Boolean(a.api))),
    [suppliers],
  )

  const compte: Record<Filtre, number> = {
    tous: classes.length,
    api: classes.filter((s) => s.api).length,
    relies: classes.filter((s) => s.api && estRelie(s.id)).length,
    'sans-api': classes.filter((s) => !s.api).length,
  }

  const visibles = classes.filter((s) =>
    filtre === 'api' ? s.api : filtre === 'relies' ? s.api && estRelie(s.id) : filtre === 'sans-api' ? !s.api : true,
  )

  const FILTRES: Array<{ id: Filtre; label: string }> = [
    { id: 'tous', label: 'Tous' },
    { id: 'api', label: 'API disponible' },
    { id: 'relies', label: 'Reliés' },
    { id: 'sans-api', label: 'Sans API' },
  ]

  return (
    <Layout>
      {/* Statistiques réduites à gauche, information MCP à droite : deux demi-pages. */}
      <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <StatsFournisseurs />
        <div className="min-w-0 [&>section]:mt-0 [&>section]:h-full">
          <BandeauMCP />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[var(--texte)]">
          Tous les fournisseurs
          <span className="ml-2 text-xs font-semibold text-[var(--texte-3)]">{compte.tous}</span>
        </h2>
        {/* Un seul bloc de tri, boutons rassemblés (règle de Max du 14/10/2026). */}
        <div role="group" aria-label="Trier les fournisseurs" className="flex flex-wrap gap-1 rounded-xl border border-[var(--trait)] bg-[var(--panneau)] p-1">
          {FILTRES.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltre(f.id)}
              aria-pressed={filtre === f.id}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filtre === f.id
                  ? 'bg-[var(--marque-rose)]/15 text-[var(--texte)] ring-1 ring-[var(--marque-rose)]/50'
                  : 'text-[var(--texte-2)] hover:text-[var(--texte)]'
              }`}
            >
              {f.label}
              <span className="ml-1.5 text-[10px] text-[var(--texte-3)]">{compte[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Trois par ligne sur ordinateur, deux sur tablette, une sur téléphone ;
          une carte ouverte prend toute la rangée. */}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {visibles.map((s) => (
          <SupplierBlock
            key={s.id}
            supplier={s}
            lien={lienDe(s.id)}
            aCommander={ventes.find((v) => v.supplierId === s.id)?.aCommander ?? 0}
            ouvert={ouvert === s.id}
            onBasculer={() => setOuvert((o) => (o === s.id ? null : s.id))}
            onSaved={recharger}
          />
        ))}
      </ul>
      {classes.length > 0 && visibles.length === 0 ? (
        <p className="case-ds mt-3 p-6 text-center text-sm text-[var(--texte-3)]">Aucun fournisseur dans ce tri.</p>
      ) : null}

      <div className="mt-8 grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <BlocSacha />
        <DemandeFournisseur />
      </div>
    </Layout>
  )
}

/**
 * « Votre fournisseur n'est pas dans la liste ? » — un nom ou une adresse, et la
 * demande part par email à l'équipe, qui l'ajoute à l'annuaire et le relie si
 * une API existe. Rien n'est écrit en base : c'est une demande, pas un compteur.
 */
function DemandeFournisseur() {
  const [valeur, setValeur] = useState('')
  const [busy, setBusy] = useState(false)
  const [etat, setEtat] = useState<{ ok: boolean; texte: string } | null>(null)

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    const fournisseur = valeur.trim()
    if (fournisseur.length < 2) return
    setBusy(true)
    setEtat(null)
    try {
      await api.demanderFournisseur(fournisseur)
      setEtat({ ok: true, texte: 'Demande envoyée — merci ! On l’ajoute à l’annuaire, et on le relie si une API est disponible.' })
      setValeur('')
    } catch (err) {
      setEtat({ ok: false, texte: err instanceof Error ? err.message : 'Envoi impossible, réessayez.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="case-ds min-w-0 p-4">
      <h2 className="text-sm font-bold text-[var(--texte)]">Votre fournisseur n'est pas dans la liste ?</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--texte-2)]">
        Demandez-le : on l'ajoute à l'annuaire, et on le relie si une API est disponible.
      </p>
      <form onSubmit={envoyer} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          placeholder="Nom du fournisseur, ou adresse de son site"
          className="min-w-0 flex-1 rounded-xl border border-[var(--trait)] bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-[var(--marque-rose)]"
        />
        <button
          type="submit"
          disabled={busy || valeur.trim().length < 2}
          className="btn-gradient shrink-0 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'Envoi…' : 'Envoyer la demande'}
        </button>
      </form>
      {etat ? (
        <p className={`mt-2 text-sm ${etat.ok ? 'text-emerald-300' : 'text-red-300'}`}>{etat.texte}</p>
      ) : null}
    </section>
  )
}
