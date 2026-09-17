import { prisma } from './src/lib/prisma.js'
import { DROPS } from './src/services/tarifs.js'
import {
  EXTENSIONS,
  ExtensionRefusee,
  catalogueDe,
  desinstallerExtension,
  installerExtension,
  lireSessionBackOffice,
  ouvrirSessionBackOffice,
} from './src/services/extensions.js'

/**
 * Les extensions DropShop : installation payée, Back Office, bornes.
 *
 *   cd backend && npx tsx check-extensions.ts
 *
 * Vraie base, compte jetable créé et détruit ici. Attentes, chacune contre
 * une panne qui coûterait de l'argent ou ouvrirait une porte :
 * - le catalogue liste deux extensions, l'une disponible, l'autre « bientôt » ;
 * - installer le Back Office prend 300 drops tout ou rien, hache le mot de passe ;
 * - sans drops : 402, rien d'installé ; un champ trop court : 400, rien pris ;
 * - une seconde installation est refusée sans redébit ; « bientôt » refusée ;
 * - la session du Back Office s'ouvre avec le bon couple, pas avec un faux,
 *   et son jeton ne porte que la boutique (pas d'userId) ;
 * - le retrait ferme la session : plus de connexion possible.
 */

let echecs = 0
function attendre(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}
async function solde(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } })).credits
}

async function main() {
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'banc-extensions'
  const t = Date.now()
  const riche = await prisma.user.create({ data: { email: `banc-ext-${t}@example.com`, passwordHash: 'x', credits: 1000 } })
  const pauvre = await prisma.user.create({ data: { email: `banc-ext-pauvre-${t}@example.com`, passwordHash: 'x', credits: 50 } })
  try {
    const shop = await prisma.shop.create({ data: { userId: riche.id, name: 'Banc extensions', platform: 'dropshipper', slug: `banc-ext-${t}` } })
    const shopPauvre = await prisma.shop.create({ data: { userId: pauvre.id, name: 'Banc pauvre', platform: 'dropshipper', slug: `banc-ext-pauvre-${t}` } })

    console.log('— Catalogue —')
    attendre('neuf extensions au catalogue : Back Office seule disponible, six DropShop, trois partenaires exclusives', EXTENSIONS.length === 9 && EXTENSIONS.filter((e) => e.statut === 'disponible').map((e) => e.id).join() === 'back-office' && EXTENSIONS.filter((e) => e.famille === 'dropshop').length === 6 && EXTENSIONS.filter((e) => e.famille === 'partenaire').every((e) => e.exclusif))
    attendre('chaque extension a un visuel, DropBank le jeton drops', EXTENSIONS.every((e) => e.logo) && EXTENSIONS.find((e) => e.id === 'dropbank')?.logo === 'drops')
    attendre('le Back Office coûte ce que dit la grille', EXTENSIONS[0].prix === DROPS.extensionBackOffice && DROPS.extensionBackOffice > 0)

    console.log('\n— Installation —')
    let refus: ExtensionRefusee | null = null
    try { await installerExtension(shop, 'back-office', { identifiant: 'ab', motDePasse: 'court' }) } catch (e) { refus = e as ExtensionRefusee }
    attendre('un champ trop court : 400, rien pris', refus?.status === 400 && (await solde(riche.id)) === 1000)
    const inst = await installerExtension(shop, 'back-office', { identifiant: 'Équipe@Boutique.fr', motDePasse: 'motdepasse-solide' })
    attendre('le Back Office est installé et 300 drops pris', inst.prixPaye === DROPS.extensionBackOffice && (await solde(riche.id)) === 1000 - DROPS.extensionBackOffice)
    const ligne = await prisma.shopExtension.findUniqueOrThrow({ where: { shopId_extensionId: { shopId: shop.id, extensionId: 'back-office' } } })
    const config = ligne.config as { identifiant: string; motDePasseHash: string }
    attendre('l\'identifiant est normalisé et le mot de passe haché, jamais en clair', config.identifiant === 'équipe@boutique.fr' && config.motDePasseHash.startsWith('$2') && !JSON.stringify(ligne.config).includes('motdepasse-solide'))
    refus = null
    try { await installerExtension(shop, 'back-office', { identifiant: 'autre', motDePasse: 'motdepasse-solide' }) } catch (e) { refus = e as ExtensionRefusee }
    attendre('une seconde installation est refusée sans redébit', refus?.status === 409 && (await solde(riche.id)) === 1000 - DROPS.extensionBackOffice)
    refus = null
    try { await installerExtension(shop, 'dropbank', {}) } catch (e) { refus = e as ExtensionRefusee }
    attendre('« bientôt » ne s\'installe pas', refus?.status === 409)
    refus = null
    try { await installerExtension(shopPauvre, 'back-office', { identifiant: 'pauvre', motDePasse: 'motdepasse-solide' }) } catch (e) { refus = e as ExtensionRefusee }
    attendre('sans drops : 402, rien d\'installé', refus?.status === 402 && (await solde(pauvre.id)) === 50 && (await prisma.shopExtension.count({ where: { shopId: shopPauvre.id } })) === 0)
    const cat = await catalogueDe(shop)
    attendre('le catalogue vu de la boutique dit « installée » et montre l\'identifiant, pas le hachage', cat[0].installee && cat[0].identifiant === 'équipe@boutique.fr' && !JSON.stringify(cat).includes('$2'))

    console.log('\n— Session du Back Office —')
    const jeton = await ouvrirSessionBackOffice(shop.shopKey, ' Équipe@boutique.fr ', 'motdepasse-solide')
    attendre('le bon couple ouvre une session (identifiant insensible à la casse et aux espaces)', typeof jeton === 'string' && jeton.length > 20)
    attendre('un mauvais mot de passe est refusé', (await ouvrirSessionBackOffice(shop.shopKey, 'équipe@boutique.fr', 'faux')) === null)
    attendre('une boutique sans Back Office refuse', (await ouvrirSessionBackOffice(shopPauvre.shopKey, 'pauvre', 'motdepasse-solide')) === null)
    const session = lireSessionBackOffice(jeton!)
    attendre('le jeton ne porte que la boutique et sa portée, jamais le compte', session?.shopId === shop.id && session.scope === 'back-office' && !jeton!.includes(riche.id) && !JSON.stringify(session).includes('userId'))
    attendre('un jeton de compte DropShipper n\'ouvre pas le Back Office', lireSessionBackOffice((await import('./src/middleware/auth.js')).signToken(riche.id)) === null)

    console.log('\n— Retrait —')
    attendre('le retrait ferme la porte', (await desinstallerExtension(shop, 'back-office')) && (await ouvrirSessionBackOffice(shop.shopKey, 'équipe@boutique.fr', 'motdepasse-solide')) === null)
    attendre('retirer deux fois rend faux', (await desinstallerExtension(shop, 'back-office')) === false)
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [riche.id, pauvre.id] } } })
    await prisma.$disconnect()
  }
  console.log(echecs ? `\n${echecs} attente(s) non tenue(s).` : '\nExtensions DropShop : tout passe.')
  process.exit(echecs ? 1 : 0)
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
