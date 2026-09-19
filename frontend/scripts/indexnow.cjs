/**
 * Annonce les adresses du site aux moteurs qui parlent IndexNow : Bing, Yandex,
 * Seznam, Naver. Bing compte double — Copilot et la recherche de ChatGPT
 * s'appuient sur son index.
 *
 *   node scripts/indexnow.cjs            montre ce qui partirait
 *   node scripts/indexnow.cjs --envoyer  l'envoie
 *
 * À lancer APRÈS le déploiement : le moteur vient lire `/<clé>.txt` sur le site
 * pour vérifier que l'annonce vient de nous. Le script le vérifie d'abord
 * lui-même — annoncer avec une clé que le site ne sert pas encore vaut un refus
 * 403, et un refus répété fait ignorer le site.
 *
 * Les adresses sont lues dans le sitemap EN LIGNE, pas dans dist/ : on n'annonce
 * que ce qui est réellement servi. Google n'écoute pas IndexNow ; pour lui, le
 * sitemap se déclare une fois dans la Search Console.
 */
const { INDEXNOW_KEY } = require('./build-geo.cjs')

const SITE = 'https://www.drop-shipper.fr'
const HOTE = 'www.drop-shipper.fr'

async function main() {
  const envoyer = process.argv.includes('--envoyer')

  const cle = await fetch(`${SITE}/${INDEXNOW_KEY}.txt`)
  const corps = cle.ok ? (await cle.text()).trim() : ''
  if (corps !== INDEXNOW_KEY) {
    console.error(`La clé n'est pas servie par le site (${cle.status}) : déployez d'abord, puis relancez.`)
    process.exit(1)
  }

  const sitemap = await (await fetch(`${SITE}/sitemap.xml`)).text()
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  // Les deux fichiers des assistants ne sont pas dans le sitemap (ce ne sont pas des pages), mais ils s'annoncent.
  urls.push(`${SITE}/llms.txt`, `${SITE}/llms-full.txt`)
  console.log(`${urls.length} adresses lues dans le sitemap en ligne.`)

  if (!envoyer) {
    urls.forEach((u) => console.log(`  ${u}`))
    console.log('\nRien envoyé. Ajoutez --envoyer pour annoncer.')
    return
  }

  const reponse = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOTE, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: urls }),
  })
  // 200 : reçu. 202 : reçu, clé en cours de vérification. Le reste est un refus, dit tel quel.
  console.log(`IndexNow : ${reponse.status} ${reponse.statusText} ${(await reponse.text()).slice(0, 200)}`)
  if (![200, 202].includes(reponse.status)) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
