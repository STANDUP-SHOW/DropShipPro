import { Router } from 'express'
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { rateLimit } from '../middleware/rateLimit.js'

/**
 * Les outils gratuits du site (www.drop-shipper.fr/outils/, chantier SEO du
 * 07/10/2026). Un seul a besoin du serveur : le détecteur de thème Shopify,
 * parce qu'un navigateur ne peut pas lire la page d'une autre boutique.
 *
 * Public, sans compte : c'est donc une porte ouverte vers Internet depuis
 * notre serveur, et elle est bornée en conséquence.
 *   - Adresses publiques seulement : une IP privée, de boucle ou de lien local
 *     est refusée AU MOMENT DE LA CONNEXION (résolution DNS vérifiée par
 *     `lookup`), pas seulement sur le nom — sinon un nom qui pointe vers
 *     169.254.169.254 lirait les métadonnées de l'hébergeur.
 *   - Ports 80 et 443 seulement, trois redirections au plus, chacune revérifiée.
 *   - 8 secondes et 1,5 Mo au plus par page ; seule la page d'accueil est lue.
 *   - Vingt détections par dix minutes et par visiteur, et un cache de dix
 *     minutes par boutique.
 * Aucune clé payante, aucun appel à un modèle.
 */
export const outilsPublicsRouter = Router()

const INTERDITES = new net.BlockList()
for (const [reseau, prefixe] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const) {
  INTERDITES.addSubnet(reseau, prefixe, 'ipv4')
}
for (const [reseau, prefixe] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  INTERDITES.addSubnet(reseau, prefixe, 'ipv6')
}

function interdite(ip: string): boolean {
  const famille = net.isIP(ip)
  if (famille === 4) return INTERDITES.check(ip, 'ipv4')
  if (famille === 6) {
    // ::ffff:10.0.0.1 — une IPv4 déguisée en IPv6.
    const v4 = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1]
    if (v4) return INTERDITES.check(v4, 'ipv4')
    return INTERDITES.check(ip, 'ipv6')
  }
  return true
}

class Refus extends Error {}

/** La résolution DNS utilisée par la connexion elle-même : refuse toute adresse non publique. */
const lookupPublic: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true }, (err, adresses) => {
    if (err) return callback(err, '', 4)
    const liste = adresses as dns.LookupAddress[]
    if (!liste.length || liste.some((a) => interdite(a.address))) {
      return callback(new Refus('Adresse non publique.'), '', 4)
    }
    if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, liste)
    callback(null, liste[0].address, liste[0].family)
  })
}

const TAILLE_MAX = 1_500_000
const DELAI_MS = 8_000
const AGENT = 'Mozilla/5.0 (compatible; DropShipperIA-ThemeDetector/1.0; +https://www.drop-shipper.fr/outils/detecteur-theme-shopify/)'

function adresseValide(brute: string): URL {
  let u: URL
  try {
    u = new URL(brute)
  } catch {
    throw new Refus('Adresse invalide.')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Refus('Seules les adresses http et https sont acceptées.')
  if (u.username || u.password) throw new Refus('Adresse invalide.')
  if (u.port && u.port !== '80' && u.port !== '443') throw new Refus('Seuls les ports standard sont acceptés.')
  const hote = u.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(hote) && interdite(hote)) throw new Refus('Adresse non publique.')
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(hote)) throw new Refus('Adresse non publique.')
  return u
}

function lirePage(u: URL, redirections = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = u.protocol === 'https:' ? https : http
    const req = client.get(
      u,
      { lookup: lookupPublic, headers: { 'User-Agent': AGENT, Accept: 'text/html' }, timeout: DELAI_MS },
      (res) => {
        const code = res.statusCode ?? 0
        if (code >= 300 && code < 400 && res.headers.location) {
          res.resume()
          if (redirections <= 0) return reject(new Refus('Trop de redirections.'))
          try {
            return resolve(lirePage(adresseValide(new URL(res.headers.location, u).toString()), redirections - 1))
          } catch (e) {
            return reject(e)
          }
        }
        if (code === 401 || code === 403) {
          res.resume()
          return reject(new Refus('La boutique refuse les lectures automatiques ou demande un mot de passe.'))
        }
        if (code >= 400) {
          res.resume()
          return reject(new Refus(`La boutique a répondu ${code}.`))
        }
        let taille = 0
        const morceaux: Buffer[] = []
        res.on('data', (m: Buffer) => {
          taille += m.length
          if (taille > TAILLE_MAX) {
            res.destroy()
            return resolve(Buffer.concat(morceaux).toString('utf8'))
          }
          morceaux.push(m)
        })
        res.on('end', () => resolve(Buffer.concat(morceaux).toString('utf8')))
        res.on('error', reject)
      },
    )
    req.on('timeout', () => req.destroy(new Refus('La boutique met trop de temps à répondre.')))
    req.on('error', reject)
  })
}

interface Detection {
  shopify: boolean
  boutique?: string
  theme?: { nom?: string; schema?: string; version?: string; themeStoreId?: number | null }
}

/** Ce que déclare la page : l'objet `Shopify.theme`, écrit par Shopify dans chaque page de boutique. */
export function analyserPage(html: string): Detection {
  const shopify = /cdn\.shopify\.com|Shopify\.shop\s*=|Shopify\.theme\s*=|myshopify\.com/.test(html)
  if (!shopify) return { shopify: false }
  const boutique = html.match(/Shopify\.shop\s*=\s*"([^"]{1,200})"/)?.[1]
  let theme: Detection['theme']
  const bloc = html.match(/Shopify\.theme\s*=\s*(\{[^;]{0,2000}?\})\s*;/)?.[1]
  if (bloc) {
    try {
      const t = JSON.parse(bloc) as Record<string, unknown>
      theme = {
        nom: typeof t.name === 'string' ? t.name.slice(0, 120) : undefined,
        schema: typeof t.schema_name === 'string' ? t.schema_name.slice(0, 120) : undefined,
        version: typeof t.schema_version === 'string' ? t.schema_version.slice(0, 40) : undefined,
        themeStoreId: typeof t.theme_store_id === 'number' ? t.theme_store_id : null,
      }
    } catch {
      // Malformed object: fall through to the field-by-field reading below.
    }
  }
  if (!theme) {
    const champ = (cle: string) => html.match(new RegExp(`"${cle}"\\s*:\\s*"([^"]{1,120})"`))?.[1]
    const id = html.match(/"theme_store_id"\s*:\s*(\d{1,7})/)?.[1]
    if (champ('schema_name') || id) {
      theme = { nom: champ('name'), schema: champ('schema_name'), version: champ('schema_version'), themeStoreId: id ? Number(id) : null }
    }
  }
  return { shopify: true, boutique, theme }
}

const cache = new Map<string, { quand: number; resultat: Detection }>()
const CACHE_MS = 10 * 60_000

outilsPublicsRouter.get(
  '/outils/theme-shopify',
  rateLimit({ windowMs: 10 * 60_000, max: 20, name: 'outil-theme-shopify' }),
  (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    let u: URL
    try {
      u = adresseValide(String(req.query.url ?? '').trim())
    } catch (e) {
      return res.status(400).json({ erreur: e instanceof Refus ? e.message : 'Adresse invalide.' })
    }
    // Only the home page is read, whatever path was pasted.
    const accueil = new URL(`${u.protocol}//${u.host}/`)
    const cle = accueil.host.toLowerCase()
    const deja = cache.get(cle)
    if (deja && Date.now() - deja.quand < CACHE_MS) return res.json(deja.resultat)

    lirePage(accueil)
      .then((html) => {
        const resultat = analyserPage(html)
        if (cache.size > 500) cache.clear()
        cache.set(cle, { quand: Date.now(), resultat })
        res.json(resultat)
      })
      .catch((e: unknown) => {
        const motif = e instanceof Refus ? e.message : 'La boutique n’a pas pu être lue (adresse introuvable ou injoignable).'
        res.status(e instanceof Refus ? 422 : 502).json({ erreur: motif })
      })
  },
)
