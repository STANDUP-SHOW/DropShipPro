import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Boxes,
  Check,
  Package,
  RefreshCw,
  ShoppingCart,
  Truck,
  ExternalLink,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { PlatformLogo } from '../components/PlatformLogo'
import { Fenetre } from './ApiSourcing'
import { api, assetUrl } from '../lib/api'

/**
 * Fournisseurs : d'où viennent les produits, et ce qu'il faut leur commander.
 *
 * Ce que ça remplace : deux écrans qui parlaient des mêmes fournisseurs sans se
 * connaître. « Acquisition » disait où trouver un produit, « API Sourcing
 * Connect » disait comment se relier — et le vendeur devait tenir les deux en
 * tête pour décider quoi que ce soit. Chaque fiche porte désormais les deux :
 * ce que le fournisseur vend, comment on l'importe, et où en est le
 * raccordement.
 *
 * En dessous, la question du matin : **qu'est-ce que je dois commander, et chez
 * qui**. Rangées par vente, les commandes obligent à rouvrir le site d'un
 * fournisseur, puis d'un autre, puis à revenir au premier — et c'est là que se
 * perdent les colis.
 */

const CAPACITES = [
  { cle: 'lectureCatalogue' as const, icone: Package, titre: 'Lire le catalogue' },
  { cle: 'stockTempsReel' as const, icone: RefreshCw, titre: 'Stock et prix en direct' },
  { cle: 'commande' as const, icone: ShoppingCart, titre: 'Commander depuis ici' },
  { cle: 'suivi' as const, icone: Truck, titre: 'Numéro de suivi' },
]

const CHEMIN: Record<string, string> = {
  extension: 'Extension seulement',
  url: 'Adresse collée',
  'les-deux': 'Adresse ou extension',
}

type Supplier = Awaited<ReturnType<typeof api.listSuppliers>>[number]
type Lien = Awaited<ReturnType<typeof api.listSupplierLinks>>[number]
type ParFournisseur = Awaited<ReturnType<typeof api.ordersBySupplier>>['fournisseurs'][number]

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [liens, setLiens] = useState<Lien[]>([])
  const [ouvert, setOuvert] = useState<Supplier | null>(null)
  const [ventes, setVentes] = useState<ParFournisseur[]>([])
  const [erreur, setErreur] = useState<string | null>(null)

  const recharger = () => {
    api.listSupplierLinks().then(setLiens).catch(() => undefined)
    api
      .ordersBySupplier()
      .then((r) => setVentes(r.fournisseurs))
      .catch(() => setErreur('Impossible de lire vos ventes.'))
  }

  useEffect(() => {
    api.listSuppliers().then(setSuppliers).catch(() => undefined)
    recharger()
  }, [])

  const lienDe = (id: string) => liens.find((l) => l.supplier === id)

  /** Les fournisseurs classés : ceux qu'on peut relier d'abord. */
  const classes = useMemo(
    () => [...suppliers].sort((a, b) => Number(Boolean(b.api)) - Number(Boolean(a.api))),
    [suppliers],
  )

  const aCommander = ventes.reduce((n, f) => n + f.aCommander, 0)

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Boxes size={22} className="text-emerald-400" />
          <span>Fournisseurs</span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-400">
          D'où viennent vos produits, et ce qu'il reste à commander. Une fiche par fournisseur : ce
          qu'il vend, comment on l'importe, et où en est le raccordement à son API.
        </p>
      </div>

      {/* ---------- Ce qu'il reste à commander ---------- */}
      {aCommander > 0 ? (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
          <ShoppingCart size={16} className="mt-0.5 shrink-0 text-amber-300" />
          <p className="text-sm text-amber-100">
            {`${aCommander} vente(s) attendent d'être commandées chez leur fournisseur.`}
          </p>
        </div>
      ) : null}

      {/* ---------- Les fiches ---------- */}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {classes.map((s) => {
          const lien = lienDe(s.id)
          const groupe = ventes.find((v) => v.supplierId === s.id)
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => (s.api ? setOuvert(s) : undefined)}
                className={`flex h-full w-full flex-col rounded-xl border border-white/10 bg-white/5 p-4 text-left transition ${
                  s.api ? 'hover:border-emerald-400/40 hover:bg-white/10' : 'cursor-default'
                }`}
              >
                <div className="flex items-start gap-3">
                  <PlatformLogo id={s.id} label={s.label} color={s.color} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{s.label}</p>
                    <p className="truncate text-[11px] text-gray-500">{s.origine}</p>
                  </div>
                  {s.api ? (
                    lien?.connected ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300">
                        <Check size={10} />
                        <span>relié</span>
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-gray-400">
                        non relié
                      </span>
                    )
                  ) : (
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-gray-500">
                      sans API
                    </span>
                  )}
                </div>

                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-400">{s.quoi}</p>

                {/* Comment on importe : la seconde moitié, celle qui manquait ici. */}
                <p className="mt-2 text-[11px] text-gray-500">{CHEMIN[s.importPath] ?? s.importPath}</p>

                {s.attention ? (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-200/90">
                    <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                    <span>{s.attention}</span>
                  </p>
                ) : null}

                {s.api ? (
                  <div className="mt-3 flex flex-1 flex-wrap items-end gap-1.5">
                    {CAPACITES.filter((c) => s.api![c.cle]).map((c) => (
                      <span
                        key={c.cle}
                        className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-gray-300"
                      >
                        <c.icone size={9} />
                        <span>{c.titre}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex-1" />
                )}

                {groupe?.aCommander ? (
                  <p className="mt-3 rounded-lg bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200">
                    {`${groupe.aCommander} à commander`}
                  </p>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>

      {/* ---------- Les ventes à commander, fournisseur par fournisseur ---------- */}
      <section className="mt-10">
        <h2 className="text-lg font-bold">Ventes à commander</h2>
        <p className="mt-1 max-w-3xl text-sm text-gray-400">
          Chaque ligne porte l'adresse de l'acheteur : c'est elle qui part chez le fournisseur, et
          c'est une faute de frappe dedans qui coûte un colis. Rien n'est payé depuis ici — la
          commande est déposée et attend votre règlement.
        </p>

        {erreur ? <p className="mt-3 text-sm text-red-300">{erreur}</p> : null}

        {ventes.length === 0 && !erreur ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-gray-400">
            Aucune vente pour l'instant.
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          {ventes.map((f) => (
            <GroupeFournisseur key={f.supplierId} groupe={f} onChange={recharger} />
          ))}
        </div>
      </section>

      {ouvert?.api ? (
        <Fenetre
          supplier={ouvert}
          lien={lienDe(ouvert.id)}
          onClose={() => setOuvert(null)}
          onSaved={recharger}
        />
      ) : null}
    </Layout>
  )
}

/** Un fournisseur et ses ventes, replié par défaut. */
function GroupeFournisseur({ groupe, onChange }: { groupe: ParFournisseur; onChange: () => void }) {
  // Déplié quand il y a quelque chose à faire : c'est ce que le vendeur cherche.
  const [ouvert, setOuvert] = useState(groupe.aCommander > 0)

  return (
    <div className="rounded-xl border border-white/10 bg-white/5">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-400 transition ${ouvert ? '' : '-rotate-90'}`}
        />
        <span className="font-semibold">{groupe.label}</span>
        {groupe.relie ? (
          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-300">
            relié
          </span>
        ) : null}
        <span className="ml-auto text-xs text-gray-400">
          {groupe.aCommander > 0
            ? `${groupe.aCommander} à commander sur ${groupe.ventes.length}`
            : `${groupe.ventes.length} vente(s), tout est commandé`}
        </span>
      </button>

      {ouvert ? (
        <ul className="border-t border-white/10">
          {groupe.ventes.map((v) => (
            <LigneVente key={v.id} vente={v} onChange={onChange} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function LigneVente({
  vente,
  onChange,
}: {
  vente: ParFournisseur['ventes'][number]
  onChange: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const adresse = (vente.buyerAddress ?? {}) as Record<string, string>
  const ligneAdresse = [
    adresse.adresse || adresse.address || adresse.address1,
    adresse.codePostal || adresse.zip || adresse.postalCode,
    adresse.ville || adresse.city,
    adresse.pays || adresse.country,
  ]
    .filter(Boolean)
    .join(', ')

  async function commander() {
    setBusy(true)
    setMessage(null)
    try {
      const r = await api.orderFromSupplier(vente.id)
      setMessage(r.message)
      onChange()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Commande impossible.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-wrap items-start gap-3 border-b border-white/5 px-4 py-3 last:border-0">
      {vente.produit.image ? (
        <img
          src={assetUrl(vente.produit.image)}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-lg bg-white/5" />
      )}

      <div className="min-w-0 flex-1">
        <Link to={`/products/${vente.produit.id}`} className="text-sm font-medium hover:underline">
          {vente.produit.titre}
        </Link>
        <p className="mt-0.5 text-xs text-gray-400">
          {`${vente.buyerName} — ${ligneAdresse || 'adresse incomplète'}`}
        </p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          {`${vente.platform} · vendu ${vente.amount.toFixed(2)} ${vente.currency}`}
          {vente.produit.supplierRef ? ` · réf. ${vente.produit.supplierRef}` : ''}
        </p>
        {message ? <p className="mt-1 text-xs text-purple-200">{message}</p> : null}
        {vente.supplierOrderError && !message ? (
          <p className="mt-1 text-xs text-amber-300">{vente.supplierOrderError}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {vente.trackingNumber ? (
          <Link to="/livraisons" className="text-xs text-purple-300 hover:underline">
            Suivi
          </Link>
        ) : null}

        {vente.supplierOrderId ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-400/15 px-3 py-1.5 text-xs text-emerald-300">
            <Check size={12} />
            <span>{vente.supplierOrderStatus || 'commandé'}</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={commander}
            disabled={busy}
            className="btn-gradient rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {busy ? 'Envoi…' : 'Commander'}
          </button>
        )}

        {vente.supplierOrderUrl ? (
          <a
            href={vente.supplierOrderUrl}
            target="_blank"
            rel="noreferrer"
            className="text-gray-400 hover:text-white"
            title="Régler la commande chez le fournisseur"
          >
            <ExternalLink size={14} />
          </a>
        ) : null}
      </div>
    </li>
  )
}
