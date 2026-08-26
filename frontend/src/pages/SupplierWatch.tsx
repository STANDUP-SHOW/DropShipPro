import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, AlertTriangle, TrendingDown, TrendingUp, PackageX, PackageCheck, Plug } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'

type Veille = Awaited<ReturnType<typeof api.supplierWatch>>
type Releve = Awaited<ReturnType<typeof api.runSupplierWatch>>

type Fournisseur = Awaited<ReturnType<typeof api.listSuppliers>>[number]

const dateCourte = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'jamais'

const ICONES = {
  prix: TrendingUp,
  rupture: PackageX,
  retour: PackageCheck,
  echec: AlertTriangle,
} as const

const COULEURS = {
  prix: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  rupture: 'border-red-400/30 bg-red-400/10 text-red-200',
  retour: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  echec: 'border-white/20 bg-white/5 text-gray-300',
} as const

/**
 * La gestion fournisseur : ce que coûte vraiment ce que vous vendez, aujourd'hui.
 *
 * Le prix d'achat enregistré à l'import vieillit vite. Un fournisseur qui monte
 * de trois euros ne prévient personne, et une rupture ne se découvre d'habitude
 * qu'au moment où un acheteur réclame son colis — quand il est déjà trop tard
 * pour éviter le litige et l'avis négatif.
 *
 * Rien n'est corrigé automatiquement, sauf une chose : une annonce dont le
 * produit est épuisé repasse en brouillon, parce que la laisser en ligne fabrique
 * un litige à coup sûr. Les prix de vente, eux, restent la décision du vendeur.
 */
export default function SupplierWatch() {
  const [veille, setVeille] = useState<Veille | null>(null)
  const [releve, setReleve] = useState<Releve | null>(null)
  const [encours, setEncours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([])

  // Le catalogue vient du serveur : la liste des fournisseurs y est déjà, et la
  // dupliquer côté navigateur créerait deux vérités à tenir à jour.
  const nomFournisseur = (id: string | null) =>
    fournisseurs.find((f) => f.id === id)?.label ?? id ?? '—'

  const charger = () => {
    api
      .supplierWatch()
      .then(setVeille)
      .catch(() => setErreur('Impossible de lire la liste des produits surveillés.'))
  }

  useEffect(charger, [])

  useEffect(() => {
    api.listSuppliers().then(setFournisseurs).catch(() => {
      // Sans le catalogue, on affiche la clé du fournisseur : moins joli, pas faux.
    })
  }, [])

  const relever = async () => {
    setEncours(true)
    setErreur(null)
    setReleve(null)
    try {
      const resultat = await api.runSupplierWatch()
      setReleve(resultat)
      charger()
    } catch {
      setErreur('Le relevé a échoué. Vérifiez vos liaisons fournisseurs.')
    } finally {
      setEncours(false)
    }
  }

  const produits = veille?.produits ?? []
  const sansReference = produits.filter((p) => !p.supplierRef)

  return (
    <Layout>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Gestion fournisseur</h1>
          <p className="mt-1 text-sm text-gray-400">
            Le prix d'achat et le stock relevés à la source, pour ne plus vendre à perte ni vendre
            ce que personne ne peut livrer.
          </p>
        </div>
        <button
          type="button"
          onClick={relever}
          disabled={encours}
          className="flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-400 disabled:opacity-50"
        >
          <RefreshCw size={16} className={encours ? 'animate-spin' : ''} />
          {encours ? 'Relevé en cours…' : 'Relever maintenant'}
        </button>
      </div>

      {erreur && (
        <p className="mb-4 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {erreur}
        </p>
      )}

      {veille && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Chiffre valeur={veille.surveilles} libelle="produits reliés à un fournisseur" />
          <Chiffre valeur={veille.total} libelle="produits au total" />
          <Chiffre valeur={sansReference.length} libelle="reconnus, sans référence lisible" />
        </div>
      )}

      {/*
        Le résultat du relevé : ce qui a changé depuis la dernière fois, et ce
        qu'il faut en faire. Un rapport qui dirait seulement « 12 produits
        vérifiés » ne servirait à rien.
      */}
      {releve && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Relevé — {releve.verifies} produit(s) vérifié(s)
          </h2>

          {releve.erreurs.map((e) => (
            <p
              key={e}
              className="mb-2 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200"
            >
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{e}</span>
            </p>
          ))}

          {releve.changements.length === 0 && releve.erreurs.length === 0 && (
            <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-400">
              Aucun changement : les prix et les stocks sont ceux que vous connaissez.
            </p>
          )}

          <div className="space-y-2">
            {releve.changements.map((c, i) => {
              const Icone = ICONES[c.genre] ?? AlertTriangle
              const baisse = c.genre === 'prix' && parseFloat(c.apres) < parseFloat(c.avant)
              return (
                <div
                  key={`${c.productId}-${i}`}
                  className={`rounded-lg border px-4 py-3 text-sm ${COULEURS[c.genre] ?? COULEURS.echec}`}
                >
                  <div className="flex items-start gap-2">
                    {baisse ? <TrendingDown size={16} className="mt-0.5 shrink-0" /> : <Icone size={16} className="mt-0.5 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <Link to={`/products/${c.productId}`} className="font-medium underline-offset-2 hover:underline">
                        {c.titre}
                      </Link>
                      <p className="mt-0.5 opacity-90">
                        {`${c.supplier} · ${c.avant} → ${c.apres}`}
                      </p>
                      {c.conseil && <p className="mt-1 opacity-75">{c.conseil}</p>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/*
        Le cas du vendeur qui arrive ici et ne voit rien : il n'a relié aucun
        fournisseur. Le dire, avec le chemin pour le faire, plutôt que d'afficher
        un tableau vide.
      */}
      {veille && veille.surveilles === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-semibold">Aucun produit n'est encore surveillé</h2>
          <p className="mt-2 text-sm text-gray-400">
            La veille reconnaît le fournisseur à l'adresse d'origine de chaque annonce. Elle ne
            couvre pour l'instant que les fournisseurs qui publient une API officielle : BigBuy et
            CJ Dropshipping. Reliez votre compte pour qu'elle ait de quoi interroger.
          </p>
          <Link
            to="/api-sourcing-connect"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
          >
            <Plug size={16} /> Relier un fournisseur
          </Link>
        </div>
      )}

      {produits.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Produits surveillés
          </h2>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Produit</th>
                  <th className="px-4 py-3 font-medium">Fournisseur</th>
                  <th className="px-4 py-3 font-medium">Achat</th>
                  <th className="px-4 py-3 font-medium">Vente</th>
                  <th className="px-4 py-3 font-medium">Marge</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Relevé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {produits.map((p) => {
                  const achat = p.supplierPrice ?? p.price
                  const marge = p.sellingPrice - achat
                  return (
                    <tr key={p.id} className="hover:bg-white/5">
                      <td className="max-w-xs truncate px-4 py-3">
                        <Link to={`/products/${p.id}`} className="hover:underline">
                          {p.aiTitle || p.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {nomFournisseur(p.supplierId)}
                        {!p.supplierRef && (
                          <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-gray-400">
                            référence introuvable
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{`${achat.toFixed(2)} ${p.currency}`}</td>
                      <td className="px-4 py-3 tabular-nums">{`${p.sellingPrice.toFixed(2)} ${p.currency}`}</td>
                      <td className={`px-4 py-3 tabular-nums ${marge <= 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                        {`${marge.toFixed(2)} ${p.currency}`}
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {p.supplierStock === null ? '—' : p.supplierStock === 0 ? 'épuisé' : p.supplierStock}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{dateCourte(p.supplierCheckedAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {sansReference.length > 0 && (
            <p className="mt-3 text-xs text-gray-500">
              {`${sansReference.length} produit(s) viennent d'un fournisseur reconnu, mais leur adresse d'origine ne porte pas d'identifiant lisible : ils ne peuvent pas être interrogés. C'est le cas des adresses raccourcies et des pages de recherche.`}
            </p>
          )}
        </section>
      )}
    </Layout>
  )
}

function Chiffre({ valeur, libelle }: { valeur: number; libelle: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-2xl font-bold tabular-nums">{valeur}</p>
      <p className="mt-0.5 text-xs text-gray-400">{libelle}</p>
    </div>
  )
}
