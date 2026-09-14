/**
 * Les prix relevés dans une autre devise, ramenés en euros.
 *
 * Le vendeur vend en euros — ses places de marché sont françaises — mais ses
 * fournisseurs ne le sont pas : SUPER DELIVERY affiche des yens (14/09/2026),
 * CJ et DHgate des dollars. Une annonce dont le prix d'achat vaut « 1 234 JPY »
 * et le prix de vente « 1 851 JPY » ne se publie nulle part, et sa marge ne
 * veut rien dire. On convertit donc à l'import, au taux du jour, et on l'écrit
 * dans les notes de l'annonce : le vendeur sait d'où vient le chiffre.
 *
 * La source est la Banque centrale européenne, servie sans clé par Frankfurter
 * (api.frankfurter.dev). Un taux vaut douze heures en mémoire. Sans réseau, on
 * retombe sur la table écrite ici, datée — un taux vieux vaut mieux qu'un prix
 * en yens, à condition de le dire. Une devise inconnue n'est pas convertie.
 */
const BASE = process.env.FRANKFURTER_BASE?.trim() || 'https://api.frankfurter.dev/v1'
const DUREE = 12 * 60 * 60 * 1000

/** Relevés BCE du 14/09/2026 : ce que vaut une unité de la devise, en euros. */
export const REPLI_DATE = '14/09/2026'
const REPLI: Record<string, number> = {
  USD: 1 / 1.1551,
  GBP: 1 / 0.85598,
  JPY: 1 / 178.52,
  CNY: 1 / 7.7489,
  CHF: 1 / 0.9431,
}

const cache = new Map<string, { taux: number; quand: number }>()

export interface Conversion {
  montant: number
  taux: number | null
  /** D'où vient le taux : la BCE, la table de repli, ou aucune (devise inconnue). */
  source: 'bce' | 'repli' | 'aucune'
}

/** Le taux d'une devise vers l'euro, ou null si personne ne la connaît. */
export async function tauxEnEuros(devise: string): Promise<{ taux: number; source: 'bce' | 'repli' } | null> {
  const code = devise.trim().toUpperCase()
  if (code === 'EUR') return { taux: 1, source: 'bce' }
  const connu = cache.get(code)
  if (connu && Date.now() - connu.quand < DUREE) return { taux: connu.taux, source: 'bce' }
  try {
    const res = await fetch(`${BASE}/latest?from=${encodeURIComponent(code)}&to=EUR`, {
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      const corps = (await res.json()) as { rates?: { EUR?: number } }
      const taux = corps.rates?.EUR
      if (typeof taux === 'number' && taux > 0) {
        cache.set(code, { taux, quand: Date.now() })
        return { taux, source: 'bce' }
      }
    }
  } catch {
    // Réseau muet ou lent : le taux mémorisé, puis la table de repli, prennent le relais.
  }
  if (connu) return { taux: connu.taux, source: 'bce' }
  return code in REPLI ? { taux: REPLI[code], source: 'repli' } : null
}

/** Un montant ramené en euros, arrondi au centime. */
export async function enEuros(montant: number, devise: string): Promise<Conversion> {
  const t = await tauxEnEuros(devise)
  if (!t) return { montant, taux: null, source: 'aucune' }
  return { montant: Math.round(montant * t.taux * 100) / 100, taux: t.taux, source: t.source }
}

/** Pour le banc : oublier les taux mémorisés. */
export function oublierTaux() {
  cache.clear()
}
