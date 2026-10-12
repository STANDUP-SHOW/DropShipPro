import { prisma } from './src/lib/prisma.js'
import { diffuserSurMarket, rattraperBoutiquesSurMarket } from './src/services/marketAuto.js'

/**
 * Éprouve la diffusion automatique sur DropShop Market sans base : les trois
 * cas qui comptent — vendeur par défaut, vendeur qui refuse, annonce déjà
 * présente (dont un retrait de la modération, qui ne doit jamais être défait).
 */
let echecs = 0
const exige = (c: boolean, m: string) => {
  if (!c) {
    echecs++
    console.log(`ECHEC : ${m}`)
  }
}

let marketAuto = true
let existante: { id: string } | null = null
const creees: unknown[] = []
const faux = prisma as unknown as Record<string, unknown>
Object.defineProperty(faux, 'user', { value: { findUnique: async () => ({ marketAuto }) }, configurable: true })
Object.defineProperty(faux, 'publication', {
  value: {
    findUnique: async () => existante,
    create: async (a: unknown) => {
      creees.push(a)
      return {}
    },
  },
  configurable: true,
})

exige((await diffuserSurMarket('p1', 'u1')) === true && creees.length === 1, 'par défaut, la publication boutique part aussi sur le Market')
const d = (creees[0] as { data: { platform: string; status: string } }).data
exige(d.platform === 'DROPSHOP_MARKET' && d.status === 'PUBLISHED', "l'annonce créée est PUBLISHED sur DROPSHOP_MARKET")

marketAuto = false
creees.length = 0
exige((await diffuserSurMarket('p1', 'u1')) === false && creees.length === 0, 'un vendeur qui a refusé ne reçoit aucune annonce')

marketAuto = true
existante = { id: 'x' }
exige((await diffuserSurMarket('p1', 'u1')) === false && creees.length === 0, 'une annonce Market existante (même retirée) n’est jamais recréée')

// Rattrapage des produits déjà en boutique : la requête porte les trois garde-fous.
let requete: any = null
let lot: any = null
Object.defineProperty(faux, 'publication', {
  value: {
    findMany: async (a: unknown) => {
      requete = a
      return [{ productId: 'p1' }, { productId: 'p2' }]
    },
    createMany: async (a: { data: unknown[] }) => {
      lot = a
      return { count: a.data.length }
    },
  },
  configurable: true,
})
exige((await rattraperBoutiquesSurMarket('u1')) === 2, 'le rattrapage crée une annonce par produit de boutique absent du Market')
const w = requete?.where
exige(w?.platform === 'OWN_SITE' && w?.status === 'PUBLISHED', 'seuls les produits PUBLIÉS en boutique sont rattrapés')
exige(w?.product?.user?.marketAuto === true, 'le refus du vendeur est respecté au rattrapage')
exige(w?.product?.publications?.none?.platform === 'DROPSHOP_MARKET', 'aucune ligne Market existante n’est touchée (un retrait reste un retrait)')
exige(w?.product?.userId === 'u1', 'le rattrapage d’un vendeur ne touche que ses produits')
exige(lot?.skipDuplicates === true && lot.data.every((x: any) => x.platform === 'DROPSHOP_MARKET' && x.status === 'PUBLISHED'), 'les annonces rattrapées sont PUBLISHED, sans doublon')
await rattraperBoutiquesSurMarket()
exige(requete?.where?.product?.userId === undefined, 'au démarrage, le rattrapage porte sur tous les vendeurs')

console.log(echecs ? `${echecs} échec(s)` : 'Diffusion auto : tout passe.')
process.exit(echecs ? 1 : 0)
