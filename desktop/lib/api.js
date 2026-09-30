'use strict'
/**
 * Le client de l'API DropShipper : les routes `/api/agent`, authentifiées par la
 * clé d'API que le vendeur crée dans Réglages. Une clé machine ne peut rien
 * payer ni publier chez nous : elle lit la file de liens et la marque.
 */

class ErreurApi extends Error {
  constructor(message, statut) {
    super(message)
    this.name = 'ErreurApi'
    this.statut = statut
  }
}

function client({ apiBase, cle, fetcher = fetch }) {
  const base = String(apiBase || '').replace(/\/+$/, '')
  async function appel(methode, chemin, corps) {
    let r
    try {
      r = await fetcher(`${base}/api/agent${chemin}`, {
        method: methode,
        headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json', 'User-Agent': 'DropShipperDesktop', ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: corps === undefined ? undefined : JSON.stringify(corps),
      })
    } catch (err) {
      throw new ErreurApi(`Serveur injoignable (${err.message}). Réessai au prochain passage.`, 0)
    }
    if (r.status === 401) throw new ErreurApi('Clé d’API refusée : créez-en une nouvelle dans drop-shipper.fr › Réglages.', 401)
    if (r.status === 429) throw new ErreurApi('Trop de requêtes : le serveur demande de patienter.', 429)
    if (!r.ok) throw new ErreurApi(`Le serveur répond ${r.status}.`, r.status)
    return r.json()
  }
  return {
    me: () => appel('GET', '/me'),
    liensNouveaux: async () => (await appel('GET', '/share?status=NEW')).links || [],
    reclamer: (id, statut = 'CLAIMED') => appel('POST', `/share/${encodeURIComponent(id)}/claim`, { status: statut }),
    /** Les annonces à publier sur les places à session (Vinted, Leboncoin, Facebook). */
    publications: async (plateforme) => (await appel('GET', `/publications${plateforme ? `?platform=${encodeURIComponent(plateforme)}` : ''}`)).publications || [],
    /** Dit au serveur ce qui s'est passé : PUBLISHED (avec l'adresse) ou FAILED (avec la raison). */
    resultat: (id, statut, urlOuRaison) =>
      appel('POST', `/publications/${encodeURIComponent(id)}/resultat`, statut === 'PUBLISHED' ? { status: statut, ...(urlOuRaison ? { externalUrl: urlOuRaison } : {}) } : { status: statut, error: urlOuRaison }),
  }
}

module.exports = { client, ErreurApi }
