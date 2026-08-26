import http from 'http'

/**
 * Éprouve les connecteurs fournisseurs contre un faux serveur.
 *
 * **Ce que ce banc prouve, et ce qu'il ne prouve pas.** Il prouve que le code
 * appelle les bonnes adresses, lit les bons champs, réunit prix et stock,
 * traduit les refus en messages utiles, et ne s'arrête pas sur une référence
 * retirée du catalogue. Il ne prouve PAS que le contrat d'API est le bon : pour
 * ça il faudrait une vraie clé BigBuy et un vrai compte CJ, que nous n'avons
 * pas. Le premier vendeur qui relie son compte sera le premier vrai essai, et
 * c'est écrit tel quel dans le mémo.
 */

const PORT = 8793
const BASE = `http://127.0.0.1:${PORT}`

process.env.BIGBUY_API_BASE = `${BASE}/bigbuy`
process.env.CJ_API_BASE = `${BASE}/cj`

const { findConnector, SupplierError } = await import('./src/services/supplierConnectors.js')

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

const serveur = http.createServer((req, res) => {
  const url = req.url ?? ''
  const repondre = (code: number, corps: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json' })
    res.end(JSON.stringify(corps))
  }

  // --- BigBuy ---------------------------------------------------------------
  if (url.startsWith('/bigbuy/')) {
    if (req.headers.authorization !== 'Bearer bonne-cle') return repondre(401, { error: 'unauthorized' })

    if (url.includes('/productstock/EPUISE')) return repondre(200, { stocks: [{ quantity: 0 }] })
    if (url.includes('/productstock/RETIRE')) return repondre(404, { error: 'not found' })
    if (url.includes('/productstock/')) return repondre(200, { stocks: [{ quantity: 3 }, { quantity: 5 }] })

    if (url.includes('/productinformation/CHER')) return repondre(200, { wholesalePrice: 61.5 })
    if (url.includes('/productinformation/')) return repondre(200, { wholesalePrice: 40 })
  }

  // --- CJ Dropshipping ------------------------------------------------------
  if (url.startsWith('/cj/')) {
    if (url.includes('getAccessToken')) {
      let corps = ''
      req.on('data', (c) => (corps += c))
      req.on('end', () => {
        const { email } = JSON.parse(corps || '{}')
        if (email !== 'moi@exemple.fr') return repondre(200, { message: 'Identifiants refusés' })
        repondre(200, { data: { accessToken: 'jeton-valide' } })
      })
      return
    }
    if (req.headers['cj-access-token'] !== 'jeton-valide') return repondre(401, { error: 'unauthorized' })
    if (url.includes('pid=VIDE')) return repondre(200, { data: [] })
    return repondre(200, { data: [{ variantSellPrice: 18.4 }, { variantSellPrice: 12.9 }] })
  }

  repondre(404, { error: 'not found' })
})

await new Promise<void>((r) => serveur.listen(PORT, '127.0.0.1', r))

try {
  const bigbuy = findConnector('bigbuy')!
  const cj = findConnector('cjdropshipping')!

  // --- BigBuy : le cas nominal ---------------------------------------------
  const releves = await bigbuy.fetchPrices(['NORMAL', 'CHER', 'EPUISE', 'RETIRE'], { apiKey: 'bonne-cle' })
  const par = new Map(releves.map((r) => [r.ref, r]))

  exige(par.get('NORMAL')?.price === 40, `prix lu : ${par.get('NORMAL')?.price}, attendu 40`)
  // Le stock est la somme des entrepôts : 3 + 5.
  exige(par.get('NORMAL')?.stock === 8, `stock lu : ${par.get('NORMAL')?.stock}, attendu 8 (3 + 5)`)
  exige(par.get('NORMAL')?.available === true, 'un produit en stock est marqué indisponible')

  exige(par.get('CHER')?.price === 61.5, `prix lu : ${par.get('CHER')?.price}, attendu 61,5`)

  exige(par.get('EPUISE')?.stock === 0, 'un stock à zéro n’est pas relevé comme tel')
  exige(par.get('EPUISE')?.available === false, 'un produit à zéro est marqué disponible')

  // Une référence retirée du catalogue ne doit pas arrêter le relevé entier.
  exige(par.get('RETIRE') !== undefined, 'une référence retirée interrompt le relevé des autres')
  exige(par.get('RETIRE')?.available === false, 'une référence retirée est marquée disponible')

  // --- BigBuy : la clé refusée doit être actionnable ------------------------
  let erreur: unknown = null
  try {
    await bigbuy.fetchPrices(['NORMAL'], { apiKey: 'mauvaise-cle' })
  } catch (e) {
    erreur = e
  }
  exige(erreur instanceof SupplierError, 'une clé refusée ne lève pas une SupplierError')
  exige(
    (erreur as InstanceType<typeof SupplierError>)?.actionnable === true,
    'une clé refusée doit être signalée comme corrigeable par le vendeur',
  )
  exige(
    /clé/i.test((erreur as Error)?.message ?? ''),
    `le message ne parle pas de la clé : « ${(erreur as Error)?.message} »`,
  )

  // Aucune clé enregistrée : refus immédiat, sans appel réseau.
  let sansCle: unknown = null
  try {
    await bigbuy.fetchPrices(['NORMAL'], {})
  } catch (e) {
    sansCle = e
  }
  exige((sansCle as InstanceType<typeof SupplierError>)?.actionnable === true, 'une clé absente doit être actionnable')

  // --- CJ : jeton obtenu puis réutilisé ------------------------------------
  const cjReleves = await cj.fetchPrices(['P1', 'VIDE'], { email: 'moi@exemple.fr', apiKey: 'secret' })
  const cjPar = new Map(cjReleves.map((r) => [r.ref, r]))

  // Le prix retenu est le plus bas des variantes : c'est lui qui décide de la
  // marge minimale.
  exige(cjPar.get('P1')?.price === 12.9, `prix CJ : ${cjPar.get('P1')?.price}, attendu 12,9 (le plus bas)`)
  exige(cjPar.get('P1')?.currency === 'USD', 'CJ facture en dollars, la devise doit le dire')
  exige(cjPar.get('P1')?.stock === null, 'CJ ne donne pas la quantité : inventer un zéro ferait passer le produit pour épuisé')
  exige(cjPar.get('VIDE')?.available === false, 'un produit sans variante est marqué disponible')

  let cjErreur: unknown = null
  try {
    await cj.fetchPrices(['P1'], { email: 'inconnu@exemple.fr', apiKey: 'secret' })
  } catch (e) {
    cjErreur = e
  }
  exige(
    (cjErreur as InstanceType<typeof SupplierError>)?.actionnable === true,
    'des identifiants CJ refusés doivent être signalés comme corrigeables',
  )

  console.log(echecs === 0 ? 'Connecteurs fournisseurs : tout passe.' : `${echecs} échec(s).`)
  process.exitCode = echecs === 0 ? 0 : 1
} finally {
  serveur.close()
}
