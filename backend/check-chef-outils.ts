import { createServer } from 'node:http'

/**
 * Les outils des chefs de rayon, éprouvés contre un faux CJ et la vraie base.
 *
 *   cd backend && npx tsx check-chef-outils.ts
 *
 * Le constat qui a tout déclenché (04/09/2026) : « je lui demande 5 produits
 * phares, il me répond qu'il n'a pas accès ni aux fournisseurs ni aux places
 * de marché ». Ce banc vérifie que chaque outil répond du réel :
 * — sans fournisseur relié, le geste exact (Sourcing › Fournisseurs), jamais
 *   un mur muet ;
 * — avec CJ relié, la recherche part avec les mots-clés et revient en lignes
 *   lisibles prix/lien ;
 * — le sondage de prix relit les prix réellement posés dans le catalogue ;
 * — les produits gagnants relisent les opportunités déposées, avec entrepôt
 *   et délai quand ils sont connus ;
 * — un refus fournisseur est transmis tel quel, jamais déguisé en résultat.
 *
 * Il tourne contre la vraie base (compte jetable créé et détruit ici) parce
 * que les outils lisent supplierConnection, product et opportunity : un faux
 * prisma validerait un contrat que personne n'utilise.
 */

let echecs = 0
function verifier(nom: string, condition: boolean, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

function fauxCj() {
  const journal: Array<{ chemin: string }> = []
  const server = createServer((req, res) => {
    const morceaux: Buffer[] = []
    req.on('data', (m) => morceaux.push(m))
    req.on('end', () => {
      const chemin = req.url ?? ''
      journal.push({ chemin })
      const repondre = (code: number, corps: unknown) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(corps))
      }
      if (chemin === '/authentication/getAccessToken') {
        const corps = JSON.parse(Buffer.concat(morceaux).toString('utf8')) as { email?: string; password?: string }
        if (corps.email !== 'vendeur@example.com' || corps.password !== 'cle-cj-valide') {
          return repondre(200, { message: 'identifiants refusés' })
        }
        return repondre(200, { data: { accessToken: 'jeton-cj' } })
      }
      if (chemin.startsWith('/product/list')) {
        if (req.headers['cj-access-token'] !== 'jeton-cj') return repondre(401, {})
        if (!/productNameEn=compass%20necklace/.test(chemin)) return repondre(200, { data: { list: [] } })
        return repondre(200, {
          data: {
            list: [
              { pid: 'CJ001', productNameEn: 'Compass Pendant Necklace', sellPrice: '2.35', productImage: 'https://cdn.cj/img1.jpg' },
              { pid: 'CJ002', productNameEn: 'Nautical Compass Necklace Gold', sellPrice: 3.1, productImage: 'https://cdn.cj/img2.jpg' },
            ],
          },
        })
      }
      return repondre(404, {})
    })
  })
  return new Promise<{ base: string; journal: typeof journal; fermer: () => void }>((resoudre) => {
    server.listen(0, '127.0.0.1', () => {
      resoudre({
        base: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
        journal,
        fermer: () => server.close(),
      })
    })
  })
}

async function main() {
  const faux = await fauxCj()
  // La base d'appel CJ est lue à l'import des connecteurs : la variable doit
  // être posée AVANT — d'où les imports dynamiques ci-dessous.
  process.env.CJ_API_BASE = faux.base
  const { prisma } = await import('./src/lib/prisma.js')
  const { executerOutilChef } = await import('./src/services/chefOutils.js')

  const user = await prisma.user.create({
    data: { email: `banc-chef-${Date.now()}@example.com`, passwordHash: 'x' },
  })

  try {
    console.log('Sans fournisseur relié')
    const nu = await executerOutilChef(user.id, null, 'chercher_fournisseurs', { motsCles: 'compass necklace' })
    verifier('le geste exact est rendu, pas un mur', /Sourcing › Fournisseurs/.test(nu), nu.slice(0, 60))

    console.log('\nAvec CJ relié')
    await prisma.supplierConnection.create({
      data: {
        userId: user.id,
        supplier: 'cjdropshipping',
        connected: true,
        data: { email: 'vendeur@example.com', apiKey: 'cle-cj-valide' },
      },
    })
    const resultat = await executerOutilChef(user.id, null, 'chercher_fournisseurs', { motsCles: 'compass necklace' })
    verifier('la recherche part avec les mots-clés', faux.journal.some((a) => /productNameEn=compass%20necklace/.test(a.chemin)))
    verifier('les lignes portent titre, prix et lien', /Compass Pendant Necklace/.test(resultat) && /2\.35 USD/.test(resultat) && /cjdropshipping\.com\/product/.test(resultat))
    verifier("l'entrepôt inconnu est dit inconnu, pas inventé", /non précisé/.test(resultat))

    await prisma.supplierConnection.update({
      where: { userId_supplier: { userId: user.id, supplier: 'cjdropshipping' } },
      data: { data: { email: 'vendeur@example.com', apiKey: 'mauvaise-cle' } },
    })
    const refus = await executerOutilChef(user.id, null, 'chercher_fournisseurs', { motsCles: 'compass necklace' })
    verifier('un refus fournisseur est transmis tel quel', /identifiants refusés|refusé/.test(refus), refus.slice(0, 80))

    console.log('\nLe sondage des prix du catalogue')
    await prisma.product.createMany({
      data: [
        { userId: user.id, title: 'Collier boussole dore', sourceUrl: 'https://x.test/1', description: 'd', images: [], price: 2.4, sellingPrice: 14.9 },
        { userId: user.id, title: 'Collier boussole argent', sourceUrl: 'https://x.test/2', description: 'd', images: [], price: 2.1, sellingPrice: 19.9 },
      ],
    })
    const prix = await executerOutilChef(user.id, null, 'sonder_prix_catalogue', { motsCles: 'collier boussole' })
    verifier('la fourchette vient des prix réellement posés', /14\.90 € à 19\.90 €/.test(prix), prix.slice(0, 120))
    verifier('la limite est dite (compte, pas marché entier)', /pas ceux du marché entier/.test(prix))

    const vide = await executerOutilChef(user.id, null, 'sonder_prix_catalogue', { motsCles: 'aspirateur robot' })
    verifier("sans produit proche, rien n'est inventé", /Aucun produit du catalogue/.test(vide))

    console.log('\nLes produits gagnants repérés')
    const rayon = await prisma.department.create({
      data: { userId: user.id, key: 'banc', agentName: 'Testeur', paidUntil: new Date(Date.now() + 86400000) },
    })
    await prisma.opportunity.create({
      data: {
        userId: user.id,
        departmentId: rayon.id,
        source: 'aliexpress',
        sourceUrl: 'https://aliexpress.com/item/1.html',
        title: 'Montre squelette automatique',
        sourcePrice: 8.2,
        marketPrice: 34.9,
        euStock: true,
        deliveryDays: 5,
      },
    })
    const gagnants = await executerOutilChef(user.id, rayon.id, 'produits_gagnants_reperes', {})
    verifier('la ligne porte achat, marché, entrepôt et délai', /8\.20/.test(gagnants) && /34\.90/.test(gagnants) && /stock Europe/.test(gagnants) && /~5 j/.test(gagnants), gagnants.slice(0, 140))

    const sans = await executerOutilChef(user.id, 'rayon-inexistant', 'produits_gagnants_reperes', {})
    verifier('un rayon sans dépôt renvoie vers les enquêtes, sans inventer', /Aucune opportunité/.test(sans))

    console.log('\nLes garde-fous')
    verifier('un outil inconnu répond sans lever', /Outil inconnu/.test(await executerOutilChef(user.id, null, 'pirater', {})))
  } finally {
    await prisma.user.deleteMany({ where: { id: user.id } })
    await prisma.$disconnect()
    faux.fermer()
  }

  console.log(echecs ? `\n${echecs} échec(s).` : '\nTout passe.')
  process.exitCode = echecs ? 1 : 0
}

main().catch((err) => {
  console.log(`\nRATE  le banc s'est interrompu — ${err?.message ?? err}`)
  process.exitCode = 1
})
