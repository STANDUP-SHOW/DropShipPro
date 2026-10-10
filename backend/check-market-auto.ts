import { prisma } from './src/lib/prisma.js'
import { diffuserSurMarket } from './src/services/marketAuto.js'

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

console.log(echecs ? `${echecs} échec(s)` : 'Diffusion auto : tout passe.')
process.exit(echecs ? 1 : 0)
