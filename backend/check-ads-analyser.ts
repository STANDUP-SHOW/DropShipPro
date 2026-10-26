import { analyserPageAds, corpsDuRapport, lireDonnees, pageAnalysable } from './src/services/adsAnalyser.js'

/**
 * Banc AdsAnalyser (DESKTOP POWER, 24/10/2026) : la lecture du rapport et les
 * refus, contre un faux modèle. Aucune base, aucune clé. Le faux modèle écrit le
 * contrat en dur : il ne prouve pas ce que le vrai modèle rend sur une vraie page.
 */
let echecs = 0
const exige = (condition: boolean, message: string) => {
  console.log(`${condition ? 'ok  ' : 'ECHEC'}  ${message}`)
  if (!condition) echecs++
}

const pageFb = { url: 'https://www.facebook.com/ads/library/?id=123', titre: 'Bibliothèque publicitaire', texte: 'Active · Diffusée depuis le 3 oct. 2026 · Portée 12 000 · '.repeat(10) }

const RAPPORT = `## Synthèse
Un mini PC vendu par une boutique.
## Données financières
- Investissement visible : Non visible sur la page
- Portée : 12 000
## Social places
## Publicités en cours
## Tendances du jour
## Tendances publicitaires
## Prompts d'images publicitaires
## Prompts de vidéos publicitaires
\`\`\`json
{"investissement": "Non visible sur la page", "portee": "12 000", "debut": "3 oct. 2026", "publicitesActives": null, "boutique": "", "signesDeVentes": null, "retour": null}
\`\`\``

async function main() {
  const d = lireDonnees(RAPPORT)
  exige(d?.portee === '12 000' && d.debut === '3 oct. 2026', 'les chiffres relevés sont lus')
  exige(d?.investissement === null && d.boutique === null, '« Non visible » et vide deviennent null, jamais un chiffre')
  exige(!corpsDuRapport(RAPPORT).includes('```json'), 'le bloc machine sort du rapport affiché')
  exige(lireDonnees('pas de json') === null, 'sans bloc json : aucune donnée inventée')

  exige(pageAnalysable('facebook', pageFb) === null, 'une page Facebook chargée est analysable')
  exige(Boolean(pageAnalysable('facebook', { ...pageFb, url: 'https://www.temu.com/x' })), 'une page hors bibliothèque est refusée (rien de débité)')
  exige(Boolean(pageAnalysable('tiktok', pageFb)), 'TikTok demandé, page Facebook ouverte : refusée')
  exige(Boolean(pageAnalysable('facebook', { ...pageFb, texte: 'Chargement…' })), 'une page vide est refusée')

  let question = ''
  const r = await analyserPageAds({ plateforme: 'facebook', page: pageFb, produit: 'Mini PC' }, async (_c, q) => ((question = q), RAPPORT))
  exige(question.includes('Mini PC') && question.includes(pageFb.url) && question.includes('Portée 12 000'), 'le modèle reçoit le produit, l’adresse et le texte de la page')
  exige(r.body.startsWith('## Synthèse') && r.donnees?.portee === '12 000', 'le rapport et ses données reviennent')

  let leve = false
  try {
    await analyserPageAds({ plateforme: 'facebook', page: pageFb }, async () => 'Désolé, je ne peux pas.')
  } catch {
    leve = true
  }
  exige(leve, 'un rapport sans « Données financières » lève (la route rend les drops)')

  console.log(echecs ? `\n${echecs} échec(s)` : '\nAdsAnalyser : tout passe.')
  process.exit(echecs ? 1 : 0)
}
main()
