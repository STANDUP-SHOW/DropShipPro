/**
 * Le suivi des colis.
 *
 * Aucun agrégateur n'est appelé par défaut, et c'est un choix : les API de suivi
 * universelles (17TRACK et consorts) sont payantes à la requête, et un vendeur
 * qui débute n'a pas à payer un abonnement pour voir passer trois colis.
 *
 * Sans clé, le transporteur est reconnu d'après la forme du numéro et le lien de
 * suivi officiel est construit — ce qui couvre l'essentiel du besoin en un clic.
 * Avec une clé 17TRACK dans TRACK17_API_KEY, les étapes remontent en plus dans
 * la fiche, sans rien changer au reste.
 */

export interface Carrier {
  id: string
  label: string
  /** Le suivi officiel du transporteur, quand il accepte un numéro en paramètre. */
  url: (tracking: string) => string
}

/**
 * Reconnaissance par la forme du numéro.
 *
 * Volontairement prudente : mieux vaut renvoyer « transporteur inconnu » et le
 * lien universel que d'envoyer le vendeur sur le site du mauvais transporteur,
 * qui affichera « colis introuvable » et fera croire à un problème.
 */
const CARRIERS: Array<Carrier & { matches: (t: string) => boolean }> = [
  {
    id: 'colissimo',
    label: 'Colissimo',
    url: (t) => `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(t)}`,
    /**
     * Deux formats bien réels, et il faut les deux.
     *
     * Le national fait treize caractères : deux d'en-tête puis onze chiffres
     * (« 6A12345678901 »). L'international suit la norme postale : deux lettres,
     * neuf chiffres, puis le pays (« CX123456789FR »). Ne reconnaître que le
     * second laissait le format le plus courant en France tomber sur le lien
     * universel.
     */
    matches: (t) =>
      (/^(6A|6C|6M|6Q|7A|7Q|8L|8R|8V)\d{11}$/.test(t) ||
        (/^[A-Z]{2}\d{9}FR$/.test(t) && /^(CA|CB|CD|CE|CF|CH|CJ|CK|CL|CM|CP|CQ|CS|CT|CV|CW|CX|CY|CZ)/.test(t))),
  },
  {
    id: 'chronopost',
    label: 'Chronopost',
    url: (t) => `https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=${encodeURIComponent(t)}`,
    matches: (t) => /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(t) && /^(XY|XX|EE)/.test(t),
  },
  {
    id: 'dhl',
    label: 'DHL',
    url: (t) => `https://www.dhl.com/fr-fr/home/tracking.html?tracking-id=${encodeURIComponent(t)}`,
    matches: (t) => /^\d{10}$/.test(t) || /^JJD\d+$/.test(t),
  },
  {
    id: 'ups',
    label: 'UPS',
    url: (t) => `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`,
    matches: (t) => /^1Z[0-9A-Z]{16}$/.test(t),
  },
  {
    id: 'fedex',
    label: 'FedEx',
    url: (t) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`,
    matches: (t) => /^\d{12}$/.test(t) || /^\d{15}$/.test(t),
  },
  {
    id: 'mondial-relay',
    label: 'Mondial Relay',
    url: (t) => `https://www.mondialrelay.fr/suivi-de-colis/?numeroExpedition=${encodeURIComponent(t)}`,
    matches: (t) => /^\d{8}$/.test(t),
  },
  {
    id: 'gls',
    label: 'GLS',
    url: (t) => `https://gls-group.com/FR/fr/suivi-colis?match=${encodeURIComponent(t)}`,
    matches: (t) => /^\d{11}$/.test(t),
  },
]

/** Le suivi universel, quand le transporteur n'est pas reconnu. */
function universal(tracking: string) {
  return `https://t.17track.net/fr#nums=${encodeURIComponent(tracking)}`
}

export interface TrackingInfo {
  number: string
  carrier: string | null
  carrierLabel: string
  url: string
  /** Vrai quand le lien est le suivi universel plutôt que celui du transporteur. */
  generic: boolean
}

export function identify(trackingNumber: string, declared?: string | null): TrackingInfo {
  const number = trackingNumber.trim().toUpperCase().replace(/\s+/g, '')

  // Ce que la plateforme a déclaré l'emporte sur la devinette : elle sait, nous
  // supposons.
  if (declared) {
    const known = CARRIERS.find((c) => c.id === declared.toLowerCase() || c.label.toLowerCase() === declared.toLowerCase())
    if (known) {
      return { number, carrier: known.id, carrierLabel: known.label, url: known.url(number), generic: false }
    }
    return { number, carrier: declared, carrierLabel: declared, url: universal(number), generic: true }
  }

  const guessed = CARRIERS.find((c) => c.matches(number))
  if (guessed) {
    return { number, carrier: guessed.id, carrierLabel: guessed.label, url: guessed.url(number), generic: false }
  }

  return { number, carrier: null, carrierLabel: 'Transporteur non reconnu', url: universal(number), generic: true }
}

export interface TrackingEvent {
  date: string
  status: string
  location: string | null
}

/**
 * Les étapes du colis, si et seulement si une clé 17TRACK est configurée.
 *
 * Renvoie null sans clé — l'interface montre alors le lien de suivi, ce qui reste
 * utilisable. Une panne de leur côté renvoie null aussi : une fiche commande ne
 * doit pas se bloquer parce qu'un service tiers est indisponible.
 */
export async function fetchEvents(trackingNumber: string, carrier?: string | null): Promise<TrackingEvent[] | null> {
  const key = process.env.TRACK17_API_KEY?.trim()
  if (!key) return null

  try {
    const res = await fetch('https://api.17track.net/track/v2.2/gettrackinfo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', '17token': key },
      body: JSON.stringify([{ number: trackingNumber, ...(carrier ? { carrier } : {}) }]),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null

    const payload = (await res.json()) as {
      data?: { accepted?: Array<{ track_info?: { tracking?: { providers?: Array<{ events?: Array<{ time_iso?: string; description?: string; location?: string }> }> } } }> }
    }

    const events = payload.data?.accepted?.[0]?.track_info?.tracking?.providers?.[0]?.events
    if (!Array.isArray(events)) return null

    return events.slice(0, 30).map((e) => ({
      date: e.time_iso ?? '',
      status: e.description ?? '',
      location: e.location ?? null,
    }))
  } catch (err) {
    console.error('suivi de colis indisponible', err)
    return null
  }
}
