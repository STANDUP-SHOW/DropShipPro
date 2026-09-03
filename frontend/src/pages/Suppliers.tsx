import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Boxes,
  Check,
  ShoppingCart,
  ExternalLink,
  ChevronDown,
} from 'lucide-react'
import { Layout } from '../components/Layout'
import { BlocSection } from '../components/stats/BlocSection'
import { AgentBar } from '../components/AgentBar'
import { SupplierBlock } from '../components/SupplierBlock'
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





type Supplier = Awaited<ReturnType<typeof api.listSuppliers>>[number]
type Lien = Awaited<ReturnType<typeof api.listSupplierLinks>>[number]
type ParFournisseur = Awaited<ReturnType<typeof api.ordersBySupplier>>['fournisseurs'][number]

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [liens, setLiens] = useState<Lien[]>([])
  const [ouvert, setOuvert] = useState<string | null>(null)
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
      <BlocSection id="fournisseurs" />
      {/* L'agent en charge de ce qui se decide ici : une question posee devant
          l ecran ne devrait pas obliger a quitter l ecran. */}
      <AgentBar
        agentKey="scrapper"
        nom="Sacha"
        emoji="🔎"
        exemple="Demandez à Sacha : ce fournisseur est-il fiable pour de l'électronique ?"
      />
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

      {/*
        Une liste depliable, et non une grille de cartes.

        La carte tronquait la description a deux lignes et cachait la mise en
        garde -- celle qui dit « livre en Inde seulement » ou « aucune place de
        marche n accepte ces produits ». Il fallait ouvrir une fenetre pour la
        lire, et la fenetre cachait a son tour la fiche pendant qu on collait sa
        cle. Tout tient desormais au meme endroit.
      */}
      <ul className="space-y-2">
        {classes.map((s) => (
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
