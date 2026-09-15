import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ExternalLink, Loader2, Store } from 'lucide-react'
import { Layout } from '../components/Layout'
import { api } from '../lib/api'
import { LIEN_SHOPIFY, PARRAINAGE_ACTIF, VERT_SHOPIFY } from '../lib/shopifyAffiliation'
import { PROPS_SANS_REMPLISSAGE } from '../lib/champSecret'

/**
 * La boutique Shopify clé en main, en quatre gestes dont trois automatiques.
 *
 * **Ce que ça remplace.** Deux entrées de menu sans lien entre elles : « créer
 * une boutique Shopify » ouvrait le site de Shopify et laissait le vendeur se
 * débrouiller, puis il fallait retrouver l'écran des plateformes, comprendre
 * qu'il faut un jeton, activer le développement d'applications personnalisées
 * dans son administration — geste réservé au propriétaire — et recopier une
 * chaîne affichée une seule fois. Entre l'ouverture de la boutique et le
 * premier produit publié, la moitié des vendeurs se perdaient, et nous ne
 * savions même pas où.
 *
 * Ici les quatre étapes sont sur un seul écran, dans l'ordre, et chacune sait
 * si elle est faite :
 *
 *  1. **Ouvrir la boutique** chez Shopify — notre lien de partenaire. C'est le
 *     seul moment où le vendeur quitte l'application, et c'est lui qui paie son
 *     abonnement : nous touchons le parrainage, comme le fait Zendrop.
 *  2. **Installer l'application** — une adresse de boutique, un écran
 *     d'approbation chez Shopify, et c'est fini. Aucun jeton ne passe par son
 *     presse-papiers (voir services/shopifyApp.ts).
 *  3. **Choisir les produits** à y mettre. Pas « tout » par défaut : un vendeur
 *     qui a trois cents annonces n'en veut pas trois cents dans une boutique
 *     neuve, et republier ce qu'il ne voulait pas coûte des crédits.
 *  4. **Publier** — catégories, collections, photos, variantes, stock. Le flux
 *     existe et il est éprouvé ; cet écran ne fait que l'appeler.
 */
type Produit = Awaited<ReturnType<typeof api.listProducts>>[number]

export default function BoutiqueShopify() {
  const [params, setParams] = useSearchParams()
  const [domaine, setDomaine] = useState('')
  const [reliee, setReliee] = useState<string | null>(null)
  const [produits, setProduits] = useState<Produit[]>([])
  const [choisis, setChoisis] = useState<Set<string>>(new Set())
  const [occupe, setOccupe] = useState(false)
  const [erreur, setErreur] = useState('')
  const [bilan, setBilan] = useState<{ published: number; failed: number } | null>(null)

  /*
   * L'étape 2 est « faite » quand la liaison Shopify existe côté serveur — pas
   * quand le vendeur a cliqué. C'est la seule source qui ne ment pas : il peut
   * avoir abandonné l'écran d'approbation, ou l'avoir fait hier.
   */
  useEffect(() => {
    api
      .listCredentials()
      .then((creds) => {
        const shopify = creds.find((c: { platform?: string }) => c?.platform === 'SHOPIFY')
        setReliee(shopify?.connected ? (shopify.hint ?? 'votre boutique') : null)
      })
      .catch(() => undefined)
    api.listProducts().then(setProduits).catch(() => undefined)
  }, [params.get('shopify')])

  // Le retour d'installation pose ?shopify=connectee : on l'efface une fois lu,
  // sinon un rechargement rejouerait indéfiniment le message de réussite.
  const revientDInstallation = params.get('shopify') === 'connectee'
  useEffect(() => {
    if (!revientDInstallation) return
    const t = setTimeout(() => {
      params.delete('shopify')
      setParams(params, { replace: true })
    }, 4000)
    return () => clearTimeout(t)
  }, [revientDInstallation])

  const dejaPubliees = useMemo(
    () => new Set(produits.filter((p) => p.publications?.some((x: { platform: string }) => x.platform === 'SHOPIFY')).map((p) => p.id)),
    [produits],
  )
  const publiables = produits.filter((p) => !dejaPubliees.has(p.id))

  async function installer() {
    setErreur('')
    setOccupe(true)
    try {
      const { url } = await api.shopifyInstallUrl(domaine, '/boutique-shopify')
      window.location.href = url
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'installation n'a pas pu être lancée")
      setOccupe(false)
    }
  }

  async function publier() {
    setErreur('')
    setBilan(null)
    setOccupe(true)
    try {
      const r = await api.publishBatch([...choisis], ['SHOPIFY'])
      setBilan({ published: r.published, failed: r.failed })
      setChoisis(new Set())
      api.listProducts().then(setProduits).catch(() => undefined)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La publication a échoué')
    } finally {
      setOccupe(false)
    }
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Store size={22} className="text-purple-300" />
          <span>
            Votre boutique <span style={{ color: VERT_SHOPIFY }}>Shopify</span>, prête à vendre
          </span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-400">
          Quatre étapes, dont une seule vous demande de sortir d'ici. À la fin, vos produits sont en
          ligne chez Shopify avec leurs photos, leurs variantes et leurs catégories — et vous
          continuez à tout piloter depuis DropShipper IA, sans second back-office.
        </p>
      </div>

      {revientDInstallation ? (
        <p className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          L'application est installée sur votre boutique. Il ne reste qu'à choisir les produits.
        </p>
      ) : null}

      <div className="space-y-4">
        <Etape
          numero={1}
          titre="Ouvrez votre boutique Shopify"
          faite={Boolean(reliee)}
          detail="Shopify facture l'abonnement, à partir de 27 €/mois en annuel. Si vous en avez déjà une, passez directement à l'étape 2."
        >
          <a
            href={LIEN_SHOPIFY}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white"
            style={{ backgroundColor: VERT_SHOPIFY }}
          >
            <span>Ouvrir une boutique Shopify</span>
            <ExternalLink size={13} />
          </a>
          {PARRAINAGE_ACTIF ? (
            <p className="mt-2 text-[11px] text-gray-500">
              Lien de partenaire : votre prix ne change pas, et il nous permet de garder DropShop
              gratuit.
            </p>
          ) : null}
        </Etape>

        <Etape
          numero={2}
          titre="Installez DropShipper IA dessus"
          faite={Boolean(reliee)}
          detail={
            reliee
              ? `Installée sur ${reliee}. Vos produits peuvent partir.`
              : "Saisissez l'adresse de votre boutique. Vous approuverez l'installation chez Shopify — aucun jeton à recopier, aucun réglage à activer."
          }
        >
          {reliee ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                {...PROPS_SANS_REMPLISSAGE}
                value={domaine}
                onChange={(e) => setDomaine(e.target.value)}
                placeholder="ma-boutique.myshopify.com"
                className="w-72 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-purple-400/70"
              />
              <button
                onClick={installer}
                disabled={occupe || domaine.trim().length < 3}
                className="btn-gradient rounded-lg px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Installer l'application
              </button>
            </div>
          )}
        </Etape>

        <Etape
          numero={3}
          titre="Choisissez les produits à y mettre"
          faite={choisis.size > 0}
          detail={
            publiables.length
              ? `${publiables.length} annonce(s) pas encore chez Shopify. Chaque publication consomme un crédit — ne cochez que ce que vous voulez vendre là-bas.`
              : 'Toutes vos annonces sont déjà publiées sur Shopify.'
          }
        >
          {publiables.length ? (
            <>
              <div className="mb-2 flex items-center gap-3 text-xs">
                <button
                  onClick={() => setChoisis(new Set(publiables.map((p) => p.id)))}
                  className="text-purple-300 underline hover:text-purple-200"
                >
                  Tout cocher
                </button>
                <button
                  onClick={() => setChoisis(new Set())}
                  className="text-gray-400 underline hover:text-gray-200"
                >
                  Tout décocher
                </button>
                <span className="text-gray-500">{choisis.size} sélectionné(s)</span>
              </div>
              <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-white/10 p-2">
                {publiables.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={choisis.has(p.id)}
                      onChange={(e) =>
                        setChoisis((s) => {
                          const n = new Set(s)
                          if (e.target.checked) n.add(p.id)
                          else n.delete(p.id)
                          return n
                        })
                      }
                      className="accent-purple-500"
                    />
                    <span className="truncate">{p.aiTitle || p.title}</span>
                  </label>
                ))}
              </div>
            </>
          ) : null}
        </Etape>

        <Etape
          numero={4}
          titre="Publiez"
          faite={Boolean(bilan && bilan.published > 0)}
          detail="Photos filigranées, variantes, stock, catégorie officielle et collections : tout part d'un coup."
        >
          <button
            onClick={publier}
            disabled={occupe || !reliee || choisis.size === 0}
            className="btn-gradient inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {occupe ? <Loader2 size={14} className="animate-spin" /> : null}
            <span>Publier {choisis.size || ''} produit(s) sur Shopify</span>
          </button>
          {bilan ? (
            <p className="mt-2 text-sm text-emerald-300">
              {bilan.published} publiée(s){bilan.failed ? `, ${bilan.failed} en échec` : ''}.
            </p>
          ) : null}
        </Etape>
      </div>

      {erreur ? <p className="mt-4 text-sm text-red-400">{erreur}</p> : null}
    </Layout>
  )
}

/** Une étape : son numéro, son état, et ce qu'elle demande. */
function Etape({
  numero,
  titre,
  detail,
  faite,
  children,
}: {
  numero: number
  titre: string
  detail: string
  faite: boolean
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex items-start gap-3">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            faite ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-gray-300'
          }`}
        >
          {faite ? <Check size={14} /> : numero}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold">{titre}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-400">{detail}</p>
          <div className="mt-3">{children}</div>
        </div>
      </div>
    </section>
  )
}
