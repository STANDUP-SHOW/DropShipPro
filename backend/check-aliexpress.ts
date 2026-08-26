import http from 'http'
import { createHmac } from 'crypto'

/**
 * Éprouve le connecteur AliExpress contre un faux serveur.
 *
 * **Ce qui compte ici, et qui n'existe pas chez les deux autres connecteurs :
 * la signature.** BigBuy et CJ acceptent une clé ou la refusent, et le refus se
 * voit. AliExpress, lui, répond « Invalid signature » avec un code HTTP 200 —
 * une signature fausse ressemble donc à un produit sans prix, c'est-à-dire à une
 * rupture. Le faux serveur recalcule donc la signature de son côté et refuse
 * tout ce qui ne correspond pas, exactement comme le vrai.
 *
 * Ce banc ne prouve pas que le contrat d'AliExpress est celui-là : pour ça il
 * faut une App Key validée, que nous n'avons pas encore. Il prouve que notre
 * code signe comme la documentation le décrit, lit les bons champs, renouvelle
 * son jeton et réenregistre le nouveau.
 */

const PORT = 8794
const BASE = `http://127.0.0.1:${PORT}`
const SECRET = 'secret-application'

process.env.ALIEXPRESS_TOP_URL = `${BASE}/sync`
process.env.ALIEXPRESS_REST_URL = `${BASE}/rest`

const { aliexpress } = await import('./src/services/supplierAliexpress.js')
const { SupplierError } = await import('./src/services/supplierConnectors.js')

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

/** La signature attendue, recalculée indépendamment du code testé. */
const signatureAttendue = (params: Record<string, string>, chemin?: string) => {
  const base = Object.keys(params)
    .sort()
    .reduce((acc, cle) => acc + cle + params[cle], chemin ?? '')
  return createHmac('sha256', SECRET).update(base, 'utf8').digest('hex').toUpperCase()
}

/** Une fiche produit telle qu'AliExpress la rend, réduite à ce qu'on en lit. */
const fiche = (variantes: unknown[], statut = 'onSelling') => ({
  aliexpress_ds_product_get_response: {
    result: {
      ae_item_base_info_dto: { product_status_type: statut, currency_code: 'EUR' },
      ae_item_sku_info_dtos: { ae_item_sku_info_d_t_o: variantes },
    },
  },
})

/** Ce que le faux serveur a vu passer, pour vérifier ensuite. */
const vus: Array<{ chemin: string; params: Record<string, string> }> = []
let jetonCourant = 'jeton-valide'

const serveur = http.createServer((req, res) => {
  let brut = ''
  req.on('data', (c) => (brut += c))
  req.on('end', () => {
    const params = Object.fromEntries(new URLSearchParams(brut)) as Record<string, string>
    const chemin = (req.url ?? '').replace('/sync', '').replace('/rest', '')
    vus.push({ chemin: req.url ?? '', params })

    const repondre = (corps: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(corps))
    }

    // --- La signature, d'abord. Comme chez AliExpress : 200 et un refus dedans.
    const { sign, ...sansSignature } = params
    const attendue = signatureAttendue(sansSignature, chemin || undefined)
    if (sign !== attendue) {
      return repondre({ error_response: { code: 25, msg: 'Invalid signature' } })
    }

    // --- Le renouvellement du jeton -----------------------------------------
    if ((req.url ?? '').includes('/auth/token/refresh')) {
      if (params.refresh_token !== 'refresh-valide') {
        return repondre({ error_response: { code: 27, msg: 'Invalid refresh token' } })
      }
      jetonCourant = 'jeton-renouvele'
      return repondre({ access_token: 'jeton-renouvele', refresh_token: 'refresh-suivant' })
    }

    // --- Le jeton d'accès ----------------------------------------------------
    if (params.access_token !== jetonCourant) {
      return repondre({
        error_response: { code: 27, sub_code: 'invalid-access-token', sub_msg: 'Access token expired' },
      })
    }

    // --- Les fiches ----------------------------------------------------------
    switch (params.product_id) {
      case 'NORMAL':
        return repondre(
          fiche([
            { offer_sale_price: '18.40', currency_code: 'EUR', sku_available_stock: 7 },
            { offer_sale_price: '12.90', currency_code: 'EUR', sku_available_stock: 5 },
          ]),
        )
      case 'EPUISE':
        return repondre(fiche([{ offer_sale_price: '9.90', currency_code: 'EUR', sku_available_stock: 0 }]))
      case 'RETIRE':
        // Une fiche encore garnie mais retirée de la vente : le piège.
        return repondre(
          fiche([{ offer_sale_price: '9.90', currency_code: 'EUR', sku_available_stock: 40 }], 'offline'),
        )
      case 'SUPPRIME':
        return repondre({ error_response: { code: 15, msg: 'Product not found' } })
      default:
        return repondre(fiche([]))
    }
  })
})

await new Promise<void>((r) => serveur.listen(PORT, '127.0.0.1', r))

try {
  // --- Le cas nominal -------------------------------------------------------
  const releves = await aliexpress.fetchPrices(['NORMAL', 'EPUISE', 'RETIRE'], {
    appKey: 'app-123',
    appSecret: SECRET,
    accessToken: 'jeton-valide',
  })
  const par = new Map(releves.map((r) => [r.ref, r]))

  exige(par.get('NORMAL')?.price === 12.9, `prix lu : ${par.get('NORMAL')?.price}, attendu 12,9 (le plus bas)`)
  exige(par.get('NORMAL')?.stock === 12, `stock lu : ${par.get('NORMAL')?.stock}, attendu 12 (7 + 5)`)
  exige(par.get('NORMAL')?.currency === 'EUR', 'la devise de la variante doit être reprise')
  exige(par.get('NORMAL')?.available === true, 'un produit en vente et en stock est marqué indisponible')

  exige(par.get('EPUISE')?.available === false, 'un stock à zéro est marqué disponible')

  // Le piège : du stock, mais la fiche est retirée de la vente.
  exige(
    par.get('RETIRE')?.available === false,
    'une fiche retirée de la vente reste disponible malgré son stock — on encaisserait une commande impossible',
  )

  // --- La signature a bien été acceptée -------------------------------------
  exige(vus.length >= 3, `le serveur n'a vu que ${vus.length} appel(s)`)
  exige(
    vus.every((v) => v.params.sign_method === 'sha256'),
    'sign_method doit valoir sha256 sur chaque appel',
  )
  exige(
    vus.every((v) => /^\d{13}$/.test(v.params.timestamp ?? '')),
    'timestamp doit être un horodatage en millisecondes',
  )
  exige(
    vus.every((v) => v.params.method === 'aliexpress.ds.product.get'),
    'la méthode appelée n’est pas celle du détail produit',
  )

  // --- Une fiche supprimée n'arrête pas le relevé des autres ----------------
  const avecSupprime = await aliexpress.fetchPrices(['SUPPRIME', 'NORMAL'], {
    appKey: 'app-123',
    appSecret: SECRET,
    accessToken: 'jeton-valide',
  })
  exige(avecSupprime.length === 2, 'une fiche supprimée interrompt le relevé des autres')
  exige(
    avecSupprime.find((r) => r.ref === 'SUPPRIME')?.available === false,
    'une fiche supprimée est marquée disponible',
  )
  exige(
    avecSupprime.find((r) => r.ref === 'NORMAL')?.price === 12.9,
    'le produit suivant une fiche supprimée n’est pas relevé',
  )

  // --- Le jeton expiré est renouvelé, et le nouveau est réenregistré --------
  jetonCourant = 'jeton-valide'
  let enregistre: Record<string, string> | null = null

  const apresRenouvellement = await aliexpress.fetchPrices(
    ['NORMAL'],
    {
      appKey: 'app-123',
      appSecret: SECRET,
      accessToken: 'jeton-perime',
      refreshToken: 'refresh-valide',
    },
    {
      async saveCredentials(patch) {
        enregistre = patch
      },
    },
  )

  exige(apresRenouvellement[0]?.price === 12.9, 'le relevé échoue après renouvellement du jeton')
  exige(enregistre !== null, "le jeton renouvelé n'est pas réenregistré — il serait perdu au relevé suivant")
  exige(
    (enregistre as unknown as Record<string, string>)?.accessToken === 'jeton-renouvele',
    'le jeton réenregistré n’est pas le nouveau',
  )
  exige(
    (enregistre as unknown as Record<string, string>)?.refreshToken === 'refresh-suivant',
    'le nouveau jeton de rafraîchissement n’est pas conservé',
  )

  // --- Sans jeton de rafraîchissement : un message qui dit quoi faire -------
  jetonCourant = 'jeton-valide'
  let sansRefresh: unknown = null
  try {
    await aliexpress.fetchPrices(['NORMAL'], {
      appKey: 'app-123',
      appSecret: SECRET,
      accessToken: 'jeton-perime',
    })
  } catch (e) {
    sansRefresh = e
  }
  exige(sansRefresh instanceof SupplierError, 'un jeton expiré sans renouvellement ne lève pas de SupplierError')
  exige(
    (sansRefresh as InstanceType<typeof SupplierError>)?.actionnable === true,
    'un jeton expiré doit être signalé comme corrigeable par le vendeur',
  )
  exige(
    /réautoris/i.test((sansRefresh as Error)?.message ?? ''),
    `le message ne dit pas quoi faire : « ${(sansRefresh as Error)?.message} »`,
  )

  // --- Un mauvais secret : la signature est refusée, et ça se voit ----------
  let mauvaisSecret: unknown = null
  try {
    await aliexpress.fetchPrices(['NORMAL'], {
      appKey: 'app-123',
      appSecret: 'pas-le-bon-secret',
      accessToken: 'jeton-valide',
    })
  } catch (e) {
    mauvaisSecret = e
  }
  exige(
    (mauvaisSecret as InstanceType<typeof SupplierError>)?.actionnable === true,
    'une signature refusée doit remonter comme corrigeable, pas comme une rupture silencieuse',
  )
  exige(
    /signature/i.test((mauvaisSecret as Error)?.message ?? ''),
    `le message ne parle pas de la signature : « ${(mauvaisSecret as Error)?.message} »`,
  )

  // --- Liaison incomplète : refus immédiat, sans appel réseau ---------------
  const avant = vus.length
  let incomplet: unknown = null
  try {
    await aliexpress.fetchPrices(['NORMAL'], { appKey: 'app-123' })
  } catch (e) {
    incomplet = e
  }
  exige((incomplet as InstanceType<typeof SupplierError>)?.actionnable === true, 'une liaison incomplète doit être actionnable')
  exige(vus.length === avant, 'une liaison incomplète ne doit déclencher aucun appel réseau')

  console.log(echecs === 0 ? 'Connecteur AliExpress : tout passe.' : `${echecs} échec(s).`)
  process.exitCode = echecs === 0 ? 0 : 1
} finally {
  serveur.close()
}
