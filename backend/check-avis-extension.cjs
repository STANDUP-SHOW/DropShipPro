/**
 * Banc : l'extension relève le code-barres déclaré et les avis AFFICHÉS.
 *
 * La page d'avis est bâtie sur la structure réelle d'un avis Amazon, relevée le
 * 19/09/2026 (balises, classes et data-hook recopiés ; les textes sont les
 * nôtres). Elle a fait tomber la première version deux fois avant ce banc :
 *  1. le bloc le plus intérieur à porter une note est le WIDGET d'étoiles —
 *     4 « avis » relevés, tous « 4,4 sur 5 étoiles », et les 13 vrais écartés ;
 *  2. Amazon écrit la note en TEXTE (« 5 étoiles sur 5 » dans un <span>), sans
 *     aria-label, ni title, ni alt — zéro avis relevé.
 */
const { JSDOM } = require('jsdom')
const fs = require('fs')
const path = require('path')

let echecs = 0
function verifier(nom, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'RATE'}  ${nom}${detail ? ` — ${detail}` : ''}`)
  if (!condition) echecs++
}

function monter(corps, tete = '') {
  const dom = new JSDOM(`<!doctype html><html><head>${tete}</head><body>${corps}</body></html>`, {
    runScripts: 'dangerously',
    url: 'https://www.exemple-marchand.test/produit/123',
  })
  const w = dom.window
  w.chrome = {
    runtime: { onMessage: { addListener() {} }, sendMessage() {}, getURL: (p) => p, id: 'test' },
    storage: { local: { get: async () => ({}), set: async () => {}, remove: async () => {} } },
  }
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  for (const f of ['config.js', 'content/fill-helpers.js', 'content/image-scan.js', 'content/adapters.js', 'content/photo-preselect.js', 'content/capture.js']) {
    const s = w.document.createElement('script')
    s.textContent = fs.readFileSync(path.join(__dirname, 'extension', f), 'utf8')
    w.document.head.appendChild(s)
  }
  return w
}

/** Un avis bâti comme ceux d'Amazon : note en texte dans le pictogramme, nom en feuille, corps en <p><span>. */
const avisAmazon = (nom, note, titre, corps) => `
  <div data-hook="review" class="a-section aok-relative">
    <div data-hook="genome-widget" class="a-row a-spacing-mini"><a class="a-profile">
      <div class="a-profile-avatar-wrapper"><div class="a-profile-avatar"><img src="https://exemple.test/avatar.jpg"><noscript>&lt;img src="https://exemple.test/avatar.jpg"/&gt; un texte de repli assez long pour dépasser soixante caractères</noscript></div></div>
      <div class="a-profile-content"><span class="a-profile-name">${nom}</span></div></a></div>
    <div class="single-review-star-rating-bar"><i data-hook="review-star-rating" class="a-icon a-icon-star a-star-${note}"><span class="a-icon-alt">${note}&nbsp;étoiles sur 5</span></i></div>
    <a class="a-link-normal a-text-bold"><h5 data-hook="reviewTitle">${titre}</h5></a>
    <div data-hook="review-by-line"><span data-hook="review-date" class="a-color-tertiary">Avis laissé en France le 3 septembre 2026</span></div>
    <div data-hook="reviewTextContainer"><div data-hook="reviewText">
      <div class="a-teaser-describedby-collapsed a-hidden">Le texte continue, cliquez pour le lire en entier.</div>
      <div data-hook="reviewRichContentContainer"><p><span>${corps}</span></p></div>
    </div></div>
    <span data-hook="helpful-vote-statement">12 personnes ont trouvé cela utile</span>
  </div>`

console.log('Une liste d’avis bâtie comme celle d’Amazon')
{
  const w = monter(`
    <div id="cm-cr-dp-review-list" class="reviews-list">
      <div class="review-summary"><i class="a-icon-star"><span class="a-icon-alt">4,4 sur 5 étoiles</span></i><span>1 204 évaluations</span></div>
      <table class="reviews-histogram"><tr title="5 étoiles : 71 %"><td>5 étoiles</td></tr></table>
      ${avisAmazon('Camille R.', 5, 'Très bonne surprise', 'La lampe éclaire bien tout le bureau et le pied ne bouge pas. Montage en cinq minutes, je recommande sans hésiter.')}
      ${avisAmazon('Jean-Marc', 2, 'Déçu par la finition', 'Le variateur grésille au niveau le plus bas et la peinture était rayée à la livraison. Renvoyée.')}
      ${avisAmazon('Sofia', 4, 'Bien pour le prix', 'Correcte pour le prix, la lumière chaude est agréable le soir. Le câble pourrait être plus long.')}
    </div>`)
  verifier('le relevé d’avis est exposé par capture.js', typeof w.__dspReleverAvis === 'function')
  const avis = w.__dspReleverAvis()
  verifier('trois avis, pas les widgets d’étoiles ni la liste', avis.length === 3, `relevés : ${avis.length}`)
  verifier('les notes sont celles des auteurs', avis.map((a) => a.stars).join() === '5,2,4', avis.map((a) => a.stars).join())
  verifier('le nom est la feuille, pas le lien entier', avis[0]?.author === 'Camille R.', `lu « ${avis[0]?.author} »`)
  verifier('le texte est le corps — ni le titre, ni la date, ni l’amorce repliée', (avis[0]?.text || '').startsWith('La lampe éclaire bien') && avis[0].text.endsWith('sans hésiter.'), `lu « ${(avis[0]?.text || '').slice(0, 40)} »`)
  verifier('aucun avis n’a pour texte un libellé de note', !avis.some((a) => /sur 5/.test(a.text)))
  verifier('l’avatar n’est pas une photo d’avis', avis.every((a) => a.photos.length === 0))
}

console.log('\nCe que la page déclare : JSON-LD et microdonnées')
{
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'Lampe',
    gtin13: '4260182240052',
    review: [
      { '@type': 'Review', author: { '@type': 'Person', name: 'Inès' }, reviewRating: { ratingValue: '4.6' }, reviewBody: 'Solide et bien emballée, conforme à la photo.', datePublished: '2026-08-02' },
      { '@type': 'Review', author: 'Paul', reviewRating: { ratingValue: 3 }, description: 'Fait le travail, sans plus.' },
      { '@type': 'Review', author: 'Sans note', reviewBody: 'Un avis sans note ne doit pas être repris.' },
    ],
  }
  const w = monter('<h1>Lampe</h1>', `<script type="application/ld+json">${JSON.stringify(ld)}</script>`)
  const avis = w.__dspReleverAvis()
  verifier('deux avis déclarés, celui sans note écarté', avis.length === 2, `relevés : ${avis.length}`)
  verifier('4,6 s’arrondit à 5, la date suit', avis[0]?.stars === 5 && avis[0]?.date === '2026-08-02')
  verifier('l’auteur est lu en objet comme en chaîne', avis[0]?.author === 'Inès' && avis[1]?.author === 'Paul')
  verifier('le code-barres vient du JSON-LD', w.__dspReleverEan() === '4260182240052', `lu ${w.__dspReleverEan()}`)
}
{
  // Les microdonnées de reichelt, telles que relevées sur la fiche 125116.
  const w = monter(`<div itemscope itemtype="http://schema.org/Product"><ul><li itemprop="brand">BAASKE</li><li itemprop="mpn">2005674</li><li itemprop="gtin13">4260182240052</li></ul>
    <div itemprop="review" itemscope itemtype="http://schema.org/Review"><span itemprop="author">Léa</span>
      <span itemprop="reviewRating" itemscope><meta itemprop="ratingValue" content="4"></span><p itemprop="reviewBody">Isolateur conforme, installé sans difficulté.</p></div></div>`)
  verifier('le code-barres vient des microdonnées', w.__dspReleverEan() === '4260182240052', `lu ${w.__dspReleverEan()}`)
  const avis = w.__dspReleverAvis()
  verifier('un avis en microdonnées', avis.length === 1 && avis[0].stars === 4 && avis[0].author === 'Léa', JSON.stringify(avis[0] || null))
}

console.log('\nAliExpress : étoiles en icônes, avis servis à part (13/11/2026)')
{
  // Structure d'un avis de fiche AliExpress : classes « list--itemReview--… »,
  // une icône comet par étoile, pleine ou vide, et aucun texte de note.
  const etoiles = (n) => [1, 2, 3, 4, 5].map((i) => `<span class="comet-icon comet-icon-${i <= n ? 'starreviewfilled' : 'starreview'}"><svg></svg></span>`).join('')
  const avisAli = (nom, note, corps) => `
    <div class="list--itemBox--abc12">
      <div class="list--itemHead--x1"><div class="stars--box--def34">${etoiles(note)}</div><span class="list--itemSku--x2">Couleur : Noir</span></div>
      <div class="list--itemReview--ghi56">${corps}</div>
      <div class="list--itemInfo--x3"><span>${nom}</span> | <span>12 oct. 2026</span></div>
    </div>`
  const w = monter(`<div class="reviews--wrap--zz">
    <div class="header--summary--x"><span>4.7</span>${etoiles(5)}<span>1 204 avis</span></div>
    ${avisAli('M***e', 5, 'Reçu en dix jours, conforme à la photo et bien emballé.')}
    ${avisAli('J***n', 3, 'Fonctionne mais la batterie tient moins que prévu.')}
  </div>`)
  const avis = w.__dspReleverAvis()
  verifier('deux avis lus par leurs icônes pleines', avis.length === 2 && avis.map((a) => a.stars).join() === '5,3', JSON.stringify(avis.map((a) => [a.stars, a.text.slice(0, 20)])))
  verifier('ni le résumé (moyenne + compteur) ni la liste ne sont un avis', !avis.some((a) => /1 204|4\.7/.test(a.text)))

  const servis = w.__dspAvisFeedbackAliExpress({
    data: {
      evaViewList: [
        { buyerName: 'L***a', buyerEval: 100, buyerFeedback: 'Very good', buyerTranslationFeedback: 'Très bien, conforme.', evalDate: '02 oct. 2026', images: ['//ae01.alicdn.com/kf/S1.jpg'] },
        { buyerName: 'P***l', buyerEval: 60, buyerFeedback: 'Correct sans plus pour ce prix.' },
        { buyerName: 'X***x', buyerEval: 'n/a', buyerFeedback: 'Note illisible : écarté.' },
      ],
    },
  })
  verifier('note sur 100 ramenée sur 5', servis[0].stars === 5 && servis[1].stars === 3)
  verifier('le texte affiché par AliExpress, la photo en https', servis[0].text === 'Très bien, conforme.' && servis[0].photos[0] === 'https://ae01.alicdn.com/kf/S1.jpg')
  verifier('une note illisible ne vaut pas 5', servis[2].stars === null)
  const fusion = w.__dspReleverAvis(servis)
  verifier(
    'les avis servis passent en tête, par le même tri (illisible écarté), puis ceux de la page',
    fusion.length === 4 && fusion[0].author === 'L***a' && !fusion.some((a) => /illisible/.test(a.text)),
    `relevés : ${fusion.length}`,
  )
  verifier('une réponse inattendue ne rend rien', w.__dspAvisFeedbackAliExpress({ data: null }).length === 0 && w.__dspAvisFeedbackAliExpress(null).length === 0)
}

console.log('\nUne page sans avis ni code-barres ne rend rien')
{
  const w = monter('<h1>Un produit</h1><p class="description">Une description qui parle de review dans son texte, sans note.</p><div class="comment-form"><label>Votre commentaire</label><textarea></textarea></div>')
  verifier('aucun avis inventé', w.__dspReleverAvis().length === 0, `relevés : ${w.__dspReleverAvis().length}`)
  verifier('aucun code-barres inventé', w.__dspReleverEan() === null)
}

if (echecs) {
  console.error(`\n${echecs} attente(s) manquée(s).`)
  process.exit(1)
}
console.log('\nAvis et code-barres relevés par l’extension : tout passe.')
