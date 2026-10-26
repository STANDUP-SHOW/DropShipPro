import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ExternalLink, Loader2, Settings2 } from 'lucide-react'
import { Layout } from '../../components/Layout'
import { IconeAutoShipper } from '../../components/menuEspace'
import { EntetePower } from '../../components/desktop/DesktopPower'
import { assetUrl } from '../../lib/api'
import { dpApi, pont, type ProduitAutoShipper, type StatsAutoShipper } from '../../lib/desktopPower'

const euros = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
const STATUT_PUB: Record<string, string> = { PUBLISHED: 'en vente', PENDING: 'en file', FAILED: 'refusée' }

function IconeTitre({ size = 22 }: { size?: number }) {
  return <IconeAutoShipper size={size} />
}

/**
 * AUTO-SHIPPER Importer (DESKTOP POWER, 24/10/2026) : ce que l'AUTO-SHIPPER a
 * importé, par lot (un lot = un jour), où chaque produit est en vente, et ce que
 * l'AUTO-SHIPPER a coûté et rapporté. Tout vient de /api/desktop-power/autoshipper ;
 * les réglages restent sur la page AUTO-SHIPPER.
 */
export default function AutoShipperImporter() {
  const p = pont()
  const [donnees, setDonnees] = useState<Awaited<ReturnType<typeof dpApi.autoshipper>> | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [ouverts, setOuverts] = useState<Set<string>>(new Set())

  useEffect(() => {
    dpApi
      .autoshipper()
      .then((d) => {
        setDonnees(d)
        if (d.lots[0]) setOuverts(new Set([d.lots[0].jour]))
      })
      .catch((e: Error) => setErreur(e.message))
  }, [])

  const s: StatsAutoShipper | null = donnees?.stats ?? null
  const cases = s
    ? [
        { l: "Jours d'activation", v: String(s.joursActives) },
        { l: 'Coût', v: `${euros(s.coutEuros)} (${s.coutDrops} drops)` },
        { l: 'Produits importés', v: String(s.produitsImportes) },
        { l: 'Produits en vente', v: String(s.produitsPublies) },
        { l: 'Ventes générées', v: String(s.ventes) },
        { l: "Chiffre d'affaires", v: euros(s.ca) },
        { l: 'Marge brute', v: euros(s.margeBrute) },
        { l: 'Profit', v: euros(s.profit) },
      ]
    : []

  return (
    <Layout>
      <EntetePower
        icone={IconeTitre}
        titre="AUTO-SHIPPER IMPORTER"
        chapo="Quand l'AUTO-SHIPPER est activé, il importe les produits par l'application desktop : WebShipper ouvre chaque fiche par son adresse et en relève le texte et les photos. Ici, la liste de ce qu'il a importé, par lot et par date, où chaque produit est en vente, et ses statistiques."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
        <Link to="/pilote" className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--trait)] px-3 py-1.5 font-semibold text-gray-200 hover:border-[var(--marque-rose)]">
          <Settings2 size={14} /> Réglages de l'AUTO-SHIPPER
        </Link>
        {p ? (
          <span className="text-emerald-300">Application ouverte : les fiches que seul un navigateur lit sont relevées ici, chaque minute.</span>
        ) : (
          <span className="text-gray-400">Sans l'application ouverte sur un PC, les fiches Temu, Shein ou AliExpress (sans API) attendent l'extension Chrome.</span>
        )}
      </div>

      {erreur ? <p className="text-xs text-red-300">{erreur}</p> : null}
      {!donnees && !erreur ? <Loader2 size={16} className="animate-spin text-gray-400" /> : null}

      {s ? (
        <section className="case-ds grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
          {cases.map((c) => (
            <div key={c.l}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{c.l}</p>
              <p className="mt-0.5 text-base font-extrabold">{c.v}</p>
            </div>
          ))}
          <p className="col-span-2 text-[11px] leading-relaxed text-gray-500 md:col-span-4">{donnees?.note}</p>
        </section>
      ) : null}

      {donnees && !donnees.lots.length ? (
        <p className="mt-4 text-xs text-gray-400">
          L'AUTO-SHIPPER n'a encore rien importé. <Link to="/pilote" className="underline hover:text-white">Activez-le sur sa page</Link>.
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        {(donnees?.lots ?? []).map((lot) => {
          const ouvert = ouverts.has(lot.jour)
          const ca = lot.produits.reduce((n, x) => n + x.ca, 0)
          return (
            <section key={lot.jour} className="case-ds">
              <button
                type="button"
                onClick={() => setOuverts((o) => (o.has(lot.jour) ? new Set([...o].filter((j) => j !== lot.jour)) : new Set([...o, lot.jour])))}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className="flex-1 text-sm font-bold">
                  Lot du {new Date(`${lot.jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </span>
                <span className="text-xs text-gray-400">
                  {lot.produits.length} produit(s) · {euros(ca)} de ventes
                </span>
                <ChevronDown size={15} className={`text-gray-500 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
              </button>
              {ouvert ? (
                <div className="grid grid-cols-1 gap-2 border-t border-[var(--trait)] p-3 md:grid-cols-2">
                  {lot.produits.map((x: ProduitAutoShipper) => (
                    <article key={x.id} className="flex gap-3 rounded-lg border border-[var(--trait)] p-3">
                      {x.image ? <img src={assetUrl(x.image)} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-md bg-white object-contain" /> : null}
                      <div className="min-w-0 flex-1">
                        <Link to={`/products/${x.id}`} className="line-clamp-2 text-xs font-semibold hover:underline">
                          {x.titre}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {x.fournisseur ?? 'fournisseur'} · achat {euros(x.prixAchat)} · vente {euros(x.prixVente)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {x.publications.length ? (
                            x.publications.map((pb) =>
                              pb.url ? (
                                <a key={pb.plateforme} href={pb.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-[var(--trait)] px-2 py-0.5 text-[10px] text-gray-300 hover:text-white">
                                  {pb.plateforme} · {STATUT_PUB[pb.statut] ?? pb.statut} <ExternalLink size={9} />
                                </a>
                              ) : (
                                <span key={pb.plateforme} className="rounded-full border border-[var(--trait)] px-2 py-0.5 text-[10px] text-gray-400">
                                  {pb.plateforme} · {STATUT_PUB[pb.statut] ?? pb.statut}
                                </span>
                              ),
                            )
                          ) : (
                            <span className="text-[10px] text-gray-500">Pas encore mis en vente</span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-gray-400">
                          {x.ventes} vente(s) · {euros(x.ca)} · marge {euros(x.marge)}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
      <p className="mt-4 text-[11px] text-gray-500">
        Les mêmes produits sont dans <Link to="/dashboard" className="underline hover:text-white">Mes annonces</Link>.
      </p>
    </Layout>
  )
}
