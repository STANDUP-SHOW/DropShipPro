/**
 * Automatic backup before any schema change, run by Railway at every start
 * (railway.json, before `prisma migrate deploy`).
 *
 * Why: the 01/09/2026 wipe rule says « avant tout changement de schéma :
 * npm run sauvegarde ». That step depended on Max running it from his machine.
 * Now the server does it itself, on the persistent volume, so nobody has to.
 *
 * - No pending migration → exits at once, the start is not slowed down.
 * - Pending migration → every table is exported as NDJSON to
 *   storage/sauvegardes/<timestamp>/ (the Railway volume), plus a manifest.
 *   The three most recent backups are kept.
 * - Backup fails → exit 1: the migration does NOT run. Data first.
 *
 * Raw SQL only: the Prisma client is generated from the NEW schema, and asking
 * it for a column the database does not have yet would fail (29/09/2026).
 */
const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const DOSSIER = path.resolve(process.env.SAUVEGARDE_DIR || path.join('storage', 'sauvegardes'))
const MIGRATIONS = path.resolve(__dirname, '..', 'prisma', 'migrations')
const GARDER = 3
const LOT = 2000

const lisible = (_k, v) => (typeof v === 'bigint' ? v.toString() : v)

async function main() {
  const prisma = new PrismaClient()
  try {
    const attendues = fs
      .readdirSync(MIGRATIONS, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)

    let appliquees = []
    try {
      const rows = await prisma.$queryRawUnsafe(
        'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      )
      appliquees = rows.map((r) => r.migration_name)
    } catch (err) {
      // No migrations table: brand-new database, nothing to protect. Any other
      // error (database unreachable…) must stop the migration.
      if (!/_prisma_migrations.*does not exist|42P01/.test(String(err && err.message))) throw err
      console.log('sauvegarde : base neuve, rien à sauvegarder')
      return
    }
    const enAttente = attendues.filter((m) => !appliquees.includes(m))
    if (!enAttente.length) {
      console.log('sauvegarde : aucune migration en attente, rien à faire')
      return
    }

    const horodatage = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const cible = path.join(DOSSIER, horodatage)
    fs.mkdirSync(cible, { recursive: true })
    console.log(`sauvegarde : ${enAttente.length} migration(s) en attente (${enAttente.join(', ')}), copie dans ${cible}`)

    const tables = (
      await prisma.$queryRawUnsafe(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name",
      )
    ).map((r) => r.table_name)

    const resume = {}
    let octets = 0
    for (const table of tables) {
      const fichier = path.join(cible, `${table}.ndjson`)
      const fd = fs.openSync(fichier, 'w')
      let n = 0
      try {
        // ctid keeps a stable order without knowing each table's key.
        for (;;) {
          const lot = await prisma.$queryRawUnsafe(`SELECT * FROM "${table.replace(/"/g, '""')}" ORDER BY ctid LIMIT ${LOT} OFFSET ${n}`)
          if (!lot.length) break
          const texte = lot.map((l) => JSON.stringify(l, lisible)).join('\n') + '\n'
          fs.writeSync(fd, texte)
          octets += Buffer.byteLength(texte)
          n += lot.length
          if (lot.length < LOT) break
        }
      } finally {
        fs.closeSync(fd)
      }
      resume[table] = n
    }

    // Manifest last: a folder without it is an interrupted backup.
    fs.writeFileSync(
      path.join(cible, 'manifeste.json'),
      JSON.stringify({ date: new Date().toISOString(), avant: enAttente, lignes: resume, octets }, null, 2),
    )
    const total = Object.values(resume).reduce((a, b) => a + b, 0)
    console.log(`sauvegarde : ${tables.length} tables, ${total} lignes, ${(octets / 1e6).toFixed(1)} Mo — OK`)

    const anciennes = fs
      .readdirSync(DOSSIER)
      .filter((d) => fs.existsSync(path.join(DOSSIER, d, 'manifeste.json')))
      .sort()
      .slice(0, -GARDER)
    for (const d of anciennes) fs.rmSync(path.join(DOSSIER, d), { recursive: true, force: true })
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('')
  console.error('=========================================================')
  console.error(' Sauvegarde avant migration IMPOSSIBLE : migration annulée.')
  console.error(` ${err && err.message ? err.message : err}`)
  console.error('=========================================================')
  process.exit(1)
})
