import { assetUrl } from '../lib/api'

/**
 * L'aperçu d'une annonce, celui qui s'ouvre au survol.
 *
 * Une liste de titres tronqués ne suffit pas à choisir sur quel produit
 * dépenser un budget ou demander une analyse : il faut revoir la photo, le
 * prix et la marge. Ouvrir la fiche pour cela ferait perdre la liste, et donc
 * la comparaison.
 *
 * **La carte ne se place pas elle-même.** Elle était posée en absolu sous la
 * ligne survolée, ce qui marche dans une liste qui ne défile pas et se fait
 * découper par la moindre boîte à `overflow`. L'appelant l'enveloppe donc : en
 * absolu sous la ligne quand rien ne défile, dans un portail posé en fixe
 * sinon.
 */
export type ProduitApercu = {
  id: string
  title: string
  aiTitle?: string | null
  aiDescription?: string | null
  images?: unknown
  price?: unknown
  shippingCost?: unknown
  sellingPrice?: unknown
  currency?: string
  sourceSite?: string | null
}

export const eurosProduit = (v: unknown, devise = 'EUR') =>
  `${Number(v ?? 0).toFixed(2).replace('.', ',')} ${devise === 'EUR' ? '€' : devise}`

export const photosProduit = (p: { images?: unknown }): string[] =>
  Array.isArray(p.images) ? (p.images as unknown[]).filter((i): i is string => typeof i === 'string') : []

export function ApercuProduit({ product }: { product: ProduitApercu }) {
  const revient = Number(product.price ?? 0) + Number(product.shippingCost ?? 0)
  const vente = Number(product.sellingPrice ?? 0)
  const marge = vente - revient
  const taux = revient > 0 ? (marge / revient) * 100 : null
  const image = photosProduit(product)[0]

  return (
    <div className="w-80 rounded-xl border border-white/15 bg-[#1b1633] p-3 shadow-2xl">
      <div className="flex gap-3">
        {image ? (
          <img src={assetUrl(image)} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-black/30 text-[10px] text-gray-500">
            aucune photo
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-snug">{product.aiTitle || product.title}</p>
          <p className="mt-1 text-[11px] text-gray-500">
            {product.sourceSite ? `Source : ${product.sourceSite}` : 'Source inconnue'}
          </p>
        </div>
      </div>

      {product.aiDescription ? (
        <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-gray-400">
          {product.aiDescription}
        </p>
      ) : null}

      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-white/10 pt-2 text-[11px]">
        <div>
          <p className="text-gray-500">Revient à</p>
          <p className="font-semibold tabular-nums">{eurosProduit(revient, product.currency)}</p>
        </div>
        <div>
          <p className="text-gray-500">Vendu</p>
          <p className="font-semibold tabular-nums text-purple-200">
            {eurosProduit(vente, product.currency)}
          </p>
        </div>
        <div>
          <p className="text-gray-500">Marge</p>
          <p
            className={
              marge >= 0 ? 'font-semibold tabular-nums text-emerald-300' : 'font-semibold tabular-nums text-red-400'
            }
          >
            {`${marge >= 0 ? '+' : ''}${eurosProduit(marge, product.currency)}`}
          </p>
        </div>
      </div>

      {taux !== null ? (
        <p className="mt-1 text-[10px] text-gray-500">
          {`Soit ${taux.toFixed(0)} % du coût de revient. Le coût par acquisition doit tenir dedans.`}
        </p>
      ) : null}
    </div>
  )
}
