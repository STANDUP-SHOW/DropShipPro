/**
 * Les fournisseurs, pour la page d'accueil du site.
 *
 * `suppliers.ts` vit sous backend/ et Vercel ne voit pas ce dossier : la frise
 * de logos de l'accueil (FriseLogos.tsx) lit donc une copie en JSON,
 * `frontend/src/data/fournisseurs.json`, écrite par ce script — même raison
 * que `seo-channels.cjs` pour les canaux. Une entrée ajoutée à suppliers.ts
 * sans relancer ce script manque à la frise : le banc check-geo.ts compare.
 *
 * Les logos : le dossier des canaux (frontend/public/logos) en porte quelques
 * uns en toutes lettres (Temu, Shein, Etsy…), pris tels quels. Pour les
 * autres, `--telecharger` va chercher l'icône du site (256 px) par le service
 * d'icônes de Google et la range dans frontend/public/logos-fournisseurs/,
 * une fois — la page ne fait jamais d'appel vers Google (RGPD). Sans le
 * drapeau, rien n'est téléchargé : un fournisseur sans fichier garde `logo:
 * null` et la frise dessine une pastille à ses initiales, dans sa couleur.
 *
 *   npx tsx exporter-fournisseurs.ts                # relit, réécrit le JSON
 *   npx tsx exporter-fournisseurs.ts --telecharger  # + icônes manquantes
 */
import fs from 'node:fs'
import path from 'node:path'
import { SUPPLIERS } from './src/services/suppliers.js'

const DOSSIER = path.resolve('../frontend/public/logos-fournisseurs')
const SORTIE = path.resolve('../frontend/src/data/fournisseurs.json')
const PUBLIC = path.resolve('../frontend/public')

/** Les logos en toutes lettres déjà dans le paquet des canaux. */
const EN_TOUTES_LETTRES: Record<string, string> = {
  temu: '/logos/temu_logo-svg.png',
  shein: '/logos/shein-logo.png',
  etsy: '/logos/etsy.png',
  joom: '/logos/joom-logo-new.png',
  zentrada: '/logos/zentrada.png',
  'amazon-business': '/logos/amazon.png',
}

const telecharger = process.argv.includes('--telecharger')

/** Un PNG d'au moins 48 px, ou rien : l'icône générique de 16 px d'un service ne vaut pas une pastille. */
function pngUtile(b: Buffer): Buffer | null {
  // Un PNG commence par 0x89 'P' 'N' 'G' ; la largeur est à l'octet 16.
  if (b.length < 200 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null
  return b.readUInt32BE(16) >= 48 ? b : null
}

/** Deux services, dans l'ordre ; le second rend souvent un .ico, écarté. */
async function iconeDe(domain: string): Promise<Buffer | null> {
  const sources = [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256`,
    `https://icon.horse/icon/${encodeURIComponent(domain)}`,
  ]
  for (const url of sources) {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null)
    if (!r?.ok || !(r.headers.get('content-type') ?? '').startsWith('image/')) continue
    const png = pngUtile(Buffer.from(await r.arrayBuffer()))
    if (png) return png
  }
  return null
}

async function main() {
  fs.mkdirSync(DOSSIER, { recursive: true })
  const fournisseurs = []
  let telecharges = 0
  let sans = 0
  for (const s of SUPPLIERS) {
    let logo: string | null = EN_TOUTES_LETTRES[s.id] ?? null
    if (logo && !fs.existsSync(path.join(PUBLIC, logo))) logo = null
    if (!logo) {
      const fichier = path.join(DOSSIER, `${s.id}.png`)
      if (!fs.existsSync(fichier) && telecharger) {
        const icone = await iconeDe(s.domain).catch(() => null)
        if (icone) {
          fs.writeFileSync(fichier, icone)
          telecharges++
        }
      }
      if (fs.existsSync(fichier)) logo = `/logos-fournisseurs/${s.id}.png`
    }
    if (!logo) sans++
    fournisseurs.push({ id: s.id, label: s.label, domain: s.domain, color: s.color, logo })
  }
  fs.writeFileSync(
    SORTIE,
    JSON.stringify(
      {
        _commentaire:
          'ENGENDRÉ par backend/exporter-fournisseurs.ts depuis services/suppliers.ts, ne pas éditer : la frise de logos de l’accueil et build-llms.cjs le lisent.',
        fournisseurs,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`${fournisseurs.length} fournisseurs écrits dans ${path.relative(process.cwd(), SORTIE)} — ${telecharges} icône(s) téléchargée(s), ${sans} sans logo${
    sans && !telecharger ? ' (relancer avec --telecharger)' : ''
  }.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
