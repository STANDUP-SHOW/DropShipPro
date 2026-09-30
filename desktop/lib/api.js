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
    if (r.status === 402) throw new ErreurApi('Solde de drops insuffisant : rechargez dans drop-shipper.fr › Mes crédits.', 402)
    if (r.status === 403) throw new ErreurApi('Cette action demande une clé « DropShipper Desktop » (Réglages › Clés pour mes agents).', 403)
    if (!r.ok) {
      const detail = await r.json().then((j) => j && j.error).catch(() => null)
      throw new ErreurApi(detail ? `${detail}` : `Le serveur répond ${r.status}.`, r.status)
    }
    return r.json()
  }
  return {
    me: () => appel('GET', '/me'),
    liensNouveaux: async () => (await appel('GET', '/share?status=NEW')).links || [],
    reclamer: (id, statut = 'CLAIMED') => appel('POST', `/share/${encodeURIComponent(id)}/claim`, { status: statut }),
    /** La liste du jour des produits gagnants (une adresse par produit). Clé desktop, comptes ≥ 500 drops. */
    gagnants: ({ margeMin = 20, max = 50 } = {}) => appel('GET', `/gagnants?margeMin=${encodeURIComponent(margeMin)}&max=${encodeURIComponent(max)}`),
    /** Importe le produit d'un lien reçu (drops du vendeur, remboursés si rien n'est livré). Clé desktop. */
    importer: (url, shareId) => appel('POST', '/import', { url, ...(shareId ? { shareId } : {}) }),
    /** Publie un produit sur les réseaux sociaux reliés du vendeur. Clé desktop. */
    publierReseaux: (productId) => appel('POST', '/social', { productId }),
    /** Met un produit en file de publication sur des places à session. Clé desktop. */
    mettreEnFile: (productId, platforms) => appel('POST', '/publications', { productId, platforms }),
    /** Les annonces à publier sur les places à session (Vinted, Leboncoin, Facebook). */
    publications: async (plateforme) => (await appel('GET', `/publications${plateforme ? `?platform=${encodeURIComponent(plateforme)}` : ''}`)).publications || [],
    /** Dit au serveur ce qui s'est passé : PUBLISHED (avec l'adresse) ou FAILED (avec la raison). */
    resultat: (id, statut, urlOuRaison) =>
      appel('POST', `/publications/${encodeURIComponent(id)}/resultat`, statut === 'PUBLISHED' ? { status: statut, ...(urlOuRaison ? { externalUrl: urlOuRaison } : {}) } : { status: statut, error: urlOuRaison }),
  }
}

module.exports = { client, ErreurApi }
