import { readFileSync } from 'node:fs'
import { FORMATS_VIDEO, VIDEO_MAX_OCTETS, nomFichierVideo, refusVideo } from './src/services/productVideo.js'
import { PLATFORMS } from './src/services/platforms.js'

/**
 * La vidéo de l'annonce : celle du vendeur, jamais celle du fournisseur.
 *
 *   cd backend && npx tsx check-video.ts
 *
 * **La règle vient du vendeur, le 03/09/2026, et elle est explicite :** « je ne
 * veux pas de capture vidéo du fournisseur, juste ajouter une vidéo sur nos
 * produits, qu'elle soit utilisée quand la plateforme de destination l'accepte.
 * Fournisseurs : uniquement photos. »
 *
 * La moitié de ce banc sert à tenir cette frontière. Une règle écrite dans un
 * commentaire cède au premier « pendant qu'on y est, on pourrait aussi
 * récupérer la vidéo Temu » : ici elle échoue à la compilation du contrôle, ce
 * qui est la seule forme de règle qui tienne.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

// --- Ce qui est accepté, et ce qui est refusé en le disant -------------------
console.log('\nLes fichiers acceptés')
{
  verifier('un MP4 passe', refusVideo('video/mp4', 5 * 1024 * 1024) === null)
  verifier('un WebM passe', refusVideo('video/webm', 1024) === null)
  verifier(
    'un MOV passe — c’est ce que rend un iPhone',
    refusVideo('video/quicktime', 1024) === null,
    'refuser le fichier qui sort du téléphone serait refuser le cas le plus courant',
  )

  const avi = refusVideo('video/x-msvideo', 1024)
  verifier('un AVI est refusé', avi !== null)
  verifier(
    'et le refus nomme le format reçu',
    /video\/x-msvideo/.test(avi ?? ''),
    avi ?? '',
  )
  verifier(
    'une image n’est pas une vidéo',
    refusVideo('image/jpeg', 1024) !== null,
  )

  const lourde = refusVideo('video/mp4', VIDEO_MAX_OCTETS + 1)
  verifier('au-delà du plafond, refus', lourde !== null)
  verifier('et le refus donne les deux tailles', /\d+ Mo.*50 Mo/.test(lourde ?? ''), lourde ?? '')
  verifier('le plafond vaut bien 50 Mo', VIDEO_MAX_OCTETS === 50 * 1024 * 1024)
}

// --- Le nom du fichier -------------------------------------------------------
console.log('\nLe nom du fichier')
{
  const nom = nomFichierVideo('Bague chevalière acier inoxydable 316L', 'video/mp4')
  verifier('lisible pour le référencement', nom.startsWith('bague-chevaliere-acier-inoxydable-316l-'), nom)
  verifier("l'extension suit le format", nom.endsWith('.mp4'))
  verifier(
    'deux envois du même titre ne se marchent pas dessus',
    nomFichierVideo('Bague', 'video/mp4') !== nomFichierVideo('Bague', 'video/mp4'),
  )
  verifier(
    'un titre vide ne produit pas un nom vide',
    nomFichierVideo('', 'video/webm').startsWith('produit-'),
    nomFichierVideo('', 'video/webm'),
  )
  verifier('chaque format a son extension', Object.keys(FORMATS_VIDEO).length === 3)
}

// --- Où la vidéo part réellement ---------------------------------------------
console.log('\nLes destinations')
{
  const avecVideo = PLATFORMS.filter((p) => p.video).map((p) => p.id)
  verifier('« Mon site » la reçoit', avecVideo.includes('OWN_SITE'), avecVideo.join(', '))
  verifier('Shopify aussi', avecVideo.includes('SHOPIFY'))

  /*
   * Les places de marché qui n'en prennent pas doivent rester à faux, même
   * quand elles acceptent les vidéos en général — eBay et Facebook en
   * acceptent. Le drapeau dit ce que le vendeur obtiendra en cliquant, pas ce
   * que la plateforme saurait faire si nous savions le lui envoyer.
   */
  for (const id of ['VINTED', 'LEBONCOIN', 'GOOGLE_SHOPPING', 'EBAY', 'AMAZON'] as const) {
    const p = PLATFORMS.find((x) => x.id === id)
    verifier(`${p?.label} reste à faux`, p?.video === false)
  }

  verifier(
    'chaque destination déclare quelque chose',
    PLATFORMS.every((p) => typeof p.video === 'boolean'),
    `${PLATFORMS.length} destinations`,
  )
}

// --- Le flux catalogue la porte ----------------------------------------------
console.log('\nLe flux public')
{
  const flux = readFileSync('src/routes/public.ts', 'utf8')
  verifier('le flux rend la vidéo', /video: product\.videoUrl \? absoluteUrl\(product\.videoUrl\) : null/.test(flux))
  verifier(
    'absolue, comme les photos — une boutique tierce ne préfixe rien',
    /absoluteUrl\(product\.videoUrl\)/.test(flux),
  )
}

// --- Shopify : après la création, et en meilleur effort ----------------------
console.log('\nShopify')
{
  const shopify = readFileSync('src/services/shopify.ts', 'utf8')
  verifier(
    'la vidéo passe par productCreateMedia',
    /productCreateMedia\(productId: \$productId, media: \$media\)/.test(shopify),
  )
  /*
   * Jamais dans le `media` de `productCreate` : Shopify y refuse l'appel
   * entier, pas le média. Une annonce valide ne doit pas cesser de partir
   * parce qu'une vidéo de trop est arrivée.
   */
  verifier(
    "l'échec d'une vidéo ne fait qu'une remarque",
    /notes\.push\(\s*`Vidéo non transmise/.test(shopify),
  )
  verifier(
    'une adresse localhost n’est jamais envoyée',
    /function urlTelechargeable/.test(shopify) && /localhost\|127\\.0\\.0\\.1/.test(shopify),
    'Shopify va chercher le fichier lui-même',
  )
}

// --- La frontière : les fournisseurs restent en photos -----------------------
console.log('\nCe qui ne doit jamais venir d’un fournisseur')
{
  const routes = readFileSync('src/routes/products.ts', 'utf8')
  const debutSchema = routes.indexOf('const captureSchema = z.object({')
  const schema = routes.slice(debutSchema, routes.indexOf('})', debutSchema))
  verifier(
    "le relevé de l'extension n'accepte aucune vidéo",
    debutSchema > 0 && !/video/i.test(schema),
    'captureSchema',
  )

  const importer = readFileSync('src/services/productImport.ts', 'utf8')
  verifier(
    "l'import n'écrit jamais videoUrl",
    !/videoUrl/.test(importer),
    'une annonce importée naît sans vidéo, toujours',
  )

  const capture = readFileSync('extension/content/capture.js', 'utf8')
  /*
   * L'extension lit bien les balises `<video>`, mais uniquement leur `poster` —
   * l'image fixe, qui est une photo du produit. Jamais le fichier.
   */
  verifier(
    "l'extension n'envoie aucune vidéo",
    !/video:/.test(capture),
    'elle ne lit que le poster, qui est une image',
  )

  const scan = readFileSync('extension/content/image-scan.js', 'utf8')
  verifier(
    'et le scan ne prend que le poster d’une balise vidéo',
    /tag === 'VIDEO'\)\s*\{\s*push\(el\.getAttribute\('poster'\)\)/.test(scan),
  )
}

console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
process.exit(echecs ? 1 : 0)
