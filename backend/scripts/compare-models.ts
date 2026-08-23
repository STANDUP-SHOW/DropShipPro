/**
 * Runs real listings through two models and prints both results side by side.
 *
 * The main rewrite is the expensive call — it is 86 % of the AI bill — and Haiku
 * costs a third of Sonnet. Whether the quality holds is not something to take on
 * anyone's word: this replays listings already in the database, shows what each
 * model produces, and reports the measured cost of each.
 *
 *   cd backend && npx tsx scripts/compare-models.ts [nombre]
 */
import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'

const prisma = new PrismaClient()
const client = new Anthropic()

const MODELS = ['claude-sonnet-4-5', 'claude-haiku-4-5']
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-sonnet-4-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
}

// Read from the service itself, so the comparison always tests the prompt that
// actually runs in production rather than a copy that drifted.
const source = readFileSync('src/services/aiEnhancer.ts', 'utf8')
const SYSTEM_PROMPT = source.split('const SYSTEM_PROMPT = `')[1].split('`')[0]

async function run(model: string, title: string, description: string, category: string | null) {
  const started = Date.now()
  const message = await client.messages.create({
    model,
    max_tokens: 2500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Titre source : ${title}
Catégorie : ${category ?? 'inconnue'}
Description source : ${description || '(aucune description)'}

Réponds UNIQUEMENT en JSON valide, sans texte autour ni bloc de code, avec ce format exact :
{"title":"","description":"","bulletPoints":[],"attributes":{},"metaTitle":"","metaDescription":"","metaKeywords":""}`,
      },
    ],
  })

  const text = message.content.find((b) => b.type === 'text')?.text ?? '{}'
  const json = text.match(/\{[\s\S]*\}/)
  let parsed: Record<string, unknown> = {}
  try {
    parsed = json ? JSON.parse(json[0]) : {}
  } catch {
    parsed = {}
  }

  const price = PRICES[model]
  const cost = (message.usage.input_tokens * price.in + message.usage.output_tokens * price.out) / 1e6

  return { parsed, cost, seconds: (Date.now() - started) / 1000, usage: message.usage }
}

async function main() {
  const count = Number(process.argv[2]) || 3
  const produits = await prisma.product.findMany({ take: count, orderBy: { createdAt: 'desc' } })
  if (!produits.length) return console.log('Aucune annonce en base.')

  const totals: Record<string, number> = {}

  for (const p of produits) {
    console.log('\n' + '='.repeat(78))
    console.log('SOURCE :', p.title.slice(0, 100))

    for (const model of MODELS) {
      try {
        const { parsed, cost, seconds, usage } = await run(model, p.title, p.description, p.sourceCategory)
        totals[model] = (totals[model] ?? 0) + cost

        const bullets = Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints : []
        const attrs = parsed.attributes && typeof parsed.attributes === 'object' ? parsed.attributes : {}
        const keywords = typeof parsed.metaKeywords === 'string' ? parsed.metaKeywords.split(',').length : 0

        console.log(`\n--- ${model}  ($${cost.toFixed(5)}, ${seconds.toFixed(1)} s, ${usage.output_tokens} tokens sortie)`)
        console.log('titre      :', String(parsed.title ?? '(vide)').slice(0, 110))
        console.log('arguments  :', bullets.length, '| attributs :', Object.keys(attrs).length, '| mots-cles :', keywords)
        console.log('description:', String(parsed.description ?? '(vide)').replace(/\s+/g, ' ').slice(0, 220) + '…')
      } catch (err) {
        console.log(`\n--- ${model} : ECHEC`, (err as Error).message)
      }
    }
  }

  console.log('\n' + '='.repeat(78))
  console.log(`COUT TOTAL sur ${produits.length} annonces`)
  for (const model of MODELS) {
    const total = totals[model] ?? 0
    console.log(`  ${model.padEnd(22)} $${total.toFixed(5)}  ->  $${(total / produits.length).toFixed(5)} par annonce`)
  }
  const [a, b] = MODELS.map((m) => totals[m] ?? 0)
  if (a && b) console.log(`  rapport : ${(a / b).toFixed(1)}x moins cher avec ${MODELS[1]}`)
  console.log('\nJugez sur le titre, le nombre d attributs et la qualite de la description.')
}

main()
  .catch((err) => console.error('ECHEC', err.message))
  .finally(() => prisma.$disconnect())
