import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { prisma } from './src/lib/prisma.js'

/**
 * Une copie locale de la base, à soi.
 *
 * ```bash
 * cd backend && npm run sauvegarde
 * ```
 *
 * **Pourquoi ça existe.** Le 01/09/2026, la base de production a été effacée par
 * une commande lancée depuis cette machine. Les sauvegardes de l'hébergeur
 * étaient là mais verrouillées derrière une offre payante, et la plus récente
 * avait dix jours : dix jours de produits, de commandes et de crédits perdus
 * pour de bon.
 *
 * La leçon n'est pas « faire attention ». C'est **qu'une sauvegarde dont on ne
 * décide pas soi-même de la fréquence n'est pas une sauvegarde** : c'est un
 * service qu'on espère. Ce script en fait une, en quelques secondes, sur le
 * disque du vendeur, sans rien demander à personne.
 *
 * `pg_dump` n'est pas installé sur la machine — d'où un export en JSON lu par
 * Prisma. Plus lent qu'un dump binaire, mais lisible, diffable, et il ne dépend
 * que de ce qui est déjà là.
 */

/** Où les copies atterrissent. Hors du dépôt : ce sont des données, pas du code. */
const DOSSIER = path.resolve('sauvegardes')

/**
 * Les tables, dans l'ordre où elles devraient être réinsérées.
 *
 * Les parents avant les enfants : une commande sans son compte ne s'insère pas.
 * L'ordre ne sert à rien à l'export, il sert à la restauration — et le mettre
 * ici évite d'avoir à le redeviner un jour de panique.
 */
const TABLES = [
  'user',
  'shop',
  'category',
  'categoryAlias',
  'product',
  'publication',
  'order',
  'payment',
  'review',
  'productReview',
  'department',
  'opportunity',
  'signal',
  'report',
  'chatMessage',
  'conversation',
  'customerMessage',
  'ticket',
  'ticketMessage',
  'platformCredential',
  'supplierConnection',
  'socialProfile',
  'socialAccount',
  'adAccount',
  'agentSubscription',
  'generatedImage',
  'apiKey',
  'authToken',
  'webhookEvent',
  'autopilot',
  'autopilotRun',
  'printProduct',
] as const

/**
 * Rend les valeurs de Prisma écrivables en JSON.
 *
 * `JSON.stringify` lève sur un `BigInt` et transforme un `Decimal` en objet
 * illisible. Un prix exporté en `{"s":1,"e":1,"d":[19,900000]}` ne se relit pas :
 * la sauvegarde aurait l'air d'avoir marché et ne servirait à rien le jour où on
 * en a besoin.
 */
function lisible(_cle: string, valeur: unknown) {
  if (typeof valeur === 'bigint') return valeur.toString()
  if (valeur && typeof valeur === 'object' && 'toFixed' in valeur && typeof (valeur as any).toFixed === 'function') {
    return String(valeur)
  }
  return valeur
}

const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const cible = path.join(DOSSIER, horodatage)
mkdirSync(cible, { recursive: true })

console.log(`Sauvegarde dans sauvegardes/${horodatage}\n`)

let lignes = 0
let octets = 0
const manquantes: string[] = []
const resume: Record<string, number> = {}

for (const table of TABLES) {
  const modele = (prisma as any)[table]
  if (!modele?.findMany) {
    // Une table renommée ou retirée du schéma : on le dit plutôt que de
    // produire une sauvegarde silencieusement incomplète.
    manquantes.push(table)
    continue
  }

  const donnees = await modele.findMany()
  const json = JSON.stringify(donnees, lisible, 0)
  writeFileSync(path.join(cible, `${table}.json`), json)

  lignes += donnees.length
  octets += Buffer.byteLength(json)
  resume[table] = donnees.length
  if (donnees.length) console.log(`  ${String(donnees.length).padStart(6)}  ${table}`)
}

/*
 * Un manifeste, écrit en dernier.
 *
 * C'est lui qui dit si la copie est entière : une sauvegarde interrompue à la
 * moitié n'a pas de manifeste, et se repère au premier coup d'œil au lieu d'être
 * découverte incomplète au moment de s'en servir.
 */
writeFileSync(
  path.join(cible, 'manifeste.json'),
  JSON.stringify(
    {
      faiteLe: new Date().toISOString(),
      tables: resume,
      lignes,
      octets,
      tablesAbsentesDuSchema: manquantes,
    },
    null,
    2,
  ),
)

console.log(`\n${lignes} lignes, ${(octets / 1024 / 1024).toFixed(1)} Mo.`)
if (manquantes.length) {
  console.log(`Absentes du schéma (à retirer de TABLES) : ${manquantes.join(', ')}`)
}

/*
 * Les anciennes copies sont gardées, et c'est délibéré.
 *
 * Une sauvegarde qui écrase la précédente ne protège que de la panne, pas de
 * l'erreur : le jour où l'on efface des données puis où l'on sauvegarde par
 * réflexe, la seule copie saine disparaît. Le ménage est laissé au vendeur.
 */
const copies = readdirSync(DOSSIER)
  .filter((d) => statSync(path.join(DOSSIER, d)).isDirectory())
  .sort()

if (copies.length > 1) {
  const avant = copies[copies.length - 2]
  try {
    const m = JSON.parse(readFileSync(path.join(DOSSIER, avant, 'manifeste.json'), 'utf8'))
    const ecart = lignes - m.lignes
    console.log(
      `Copie précédente (${avant}) : ${m.lignes} lignes — ${ecart >= 0 ? '+' : ''}${ecart} depuis.`,
    )
    /*
     * Une chute brutale est signalée, jamais empêchée.
     *
     * C'est exactement ce qui s'est passé le 01/09 : la base est passée de
     * plusieurs milliers de lignes à zéro sans que rien ne le dise. Une
     * sauvegarde qui sauve un désastre sans le signaler le rend permanent.
     */
    if (m.lignes > 50 && lignes < m.lignes * 0.5) {
      console.log(
        `\n  ATTENTION : la base a perdu plus de la moitié de ses lignes depuis ${avant}.\n` +
          `  Ne supprimez pas la copie précédente avant d'avoir compris pourquoi.`,
      )
    }
  } catch {
    /* manifeste illisible : on ne compare simplement pas */
  }
}

console.log(`\n${copies.length} copie(s) conservée(s) dans backend/sauvegardes/.`)

await prisma.$disconnect()
