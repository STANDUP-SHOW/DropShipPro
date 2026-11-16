import { useEffect, useMemo, useState } from 'react'
import { api } from './api'

/**
 * La voie d'import d'une fiche AliExpress dépend du VENDEUR, pas du rapport.
 *
 * Les rapports marquent les pages AliExpress « extension » : sans clé, notre
 * serveur bute sur leur mur anti-robot. Mais un vendeur qui a relié son API
 * AliExpress les importe par l'API (POST /products/import-batch passe par elle,
 * routes/products.ts). Signalé par Max le 16/11/2026 : API reliée, et les
 * produits AliExpress toujours proposés « par l'extension ».
 */

let relie: Promise<boolean> | null = null

/** AliExpress relié et accepté par AliExpress, demandé une fois par chargement de page. */
export function aliexpressRelie(): Promise<boolean> {
  relie ??= api
    .listSupplierLinks()
    .then((liens) => liens.some((l) => l.supplier === 'aliexpress' && l.connected))
    .catch(() => false)
  return relie
}

/** Une page produit AliExpress (`/item/<id>.html`), celles que l'API sait importer. */
export function estFicheAliExpress(url: string | null | undefined): boolean {
  try {
    const u = new URL(String(url))
    return u.hostname.includes('aliexpress.') && /\/item\/\d{6,}/.test(u.pathname)
  } catch {
    return false
  }
}

/** Les fiches AliExpress passent en import direct (`api`) quand l'API est reliée. */
export function avecVoieApi<T extends { url: string; import: 'api' | 'url' | 'extension' }>(produits: T[], api_: boolean): T[] {
  if (!api_) return produits
  return produits.map((p) => (p.import === 'extension' && estFicheAliExpress(p.url) ? { ...p, import: 'api' as const } : p))
}

/** Même chose, au rendu : la liste s'affiche d'abord telle quelle, puis se corrige quand la réponse arrive. */
export function useAvecVoieApi<T extends { url: string; import: 'api' | 'url' | 'extension' }>(produits: T[]): T[] {
  const [api_, setApi] = useState(false)
  useEffect(() => {
    let vivant = true
    if (produits.some((p) => p.import === 'extension' && estFicheAliExpress(p.url)))
      aliexpressRelie().then((r) => vivant && setApi(r))
    return () => {
      vivant = false
    }
  }, [produits])
  return useMemo(() => (api_ ? avecVoieApi(produits, true) : produits), [api_, produits])
}
