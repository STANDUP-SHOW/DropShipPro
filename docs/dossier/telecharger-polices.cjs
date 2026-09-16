/**
 * Embarque les polices DANS les documents du dossier.
 *
 * **Pourquoi, et ce que ça a coûté de ne pas le faire.** Le premier PDF du
 * business plan est sorti avec ses titres en **Times New Roman** : la feuille
 * Google Fonts est chargée en `display=swap`, donc le texte s'affiche d'abord
 * dans une police de secours et bascule quand la vraie arrive — sauf que Chrome
 * headless imprime sans attendre la bascule. Le PDF sortait, il faisait ses
 * trente-deux pages, et rien ne signalait que la typographie était fausse.
 *
 * Deuxième essai : télécharger les `.woff2` à côté du HTML et les servir en
 * relatif. Chrome a continué d'imprimer en Times New Roman — une page `file://`
 * est une origine opaque, et une police y reste une requête à part.
 *
 * Troisième essai, et la vraie leçon : j'ai **réécrit** les règles `@font-face`
 * à partir de ce que j'en lisais — famille, style, graisse, plage unicode. Le
 * résultat marchait pour l'italique et échouait pour tout le reste, ce qui est
 * la signature d'une règle recopiée à côté. Google déclare des choses que je ne
 * reproduisais pas : `font-stretch: 100%`, des graisses en INTERVALLE pour les
 * fontes variables (`font-weight: 100 700`, dont ma lecture ne gardait que le
 * premier nombre), et l'ordre exact des descripteurs.
 *
 * D'où ce qui est fait ici : **la feuille de Google est conservée mot pour
 * mot**, et on n'y échange que deux choses — l'adresse de chaque fichier,
 * remplacée par son contenu encodé, et `display: swap` qui devient `block`.
 * Aucune règle n'est réécrite, donc aucune ne peut être mal réécrite.
 *
 * Règle générale, et elle vaut au-delà des polices : **quand une feuille de
 * style tierce marche dans un navigateur, on la transporte, on ne la
 * paraphrase pas.**
 *
 * On ne garde que les sous-ensembles **latin** : la feuille en compte six par
 * graisse (cyrillique, grec, vietnamien…) et les embarquer tous quadruplerait
 * le poids pour des caractères qu'aucune page n'emploie.
 *
 *   node docs/dossier/telecharger-polices.cjs
 */
const fs = require('node:fs')
const path = require('node:path')

const DOSSIER = __dirname

/*
 * Les graisses demandées, et le **700 d'IBM Plex Sans compte autant que les
 * autres** : le corps du document emploie `<b>` un peu partout — noms propres,
 * chiffres mis en avant, verdicts. Sans cette graisse, Chrome retombait sur
 * Times New Roman Bold au milieu d'un paragraphe en IBM Plex Sans, ce qui se
 * voit immédiatement et ne s'explique pas.
 *
 * La règle : lister les graisses que le document EMPLOIE, pas celles qu'on
 * croit avoir choisies dans sa feuille de style.
 */
const FEUILLE =
  'https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800' +
  '&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400' +
  '&family=IBM+Plex+Mono:wght@400;500&display=swap'

/*
 * **L'agent d'un VIEUX Chrome, et c'est le cœur de l'affaire.**
 *
 * À un navigateur récent, l'API `css2` sert des fontes **variables** : un seul
 * fichier `.woff2` couvre toutes les graisses d'une famille, découpé en six
 * sous-ensembles unicode. C'est excellent sur le web et c'est ce qui a fait
 * échouer trois tentatives de suite ici — **Chrome headless n'instancie pas un
 * axe de graisse au moment d'imprimer**. Les titres ressortaient en Times New
 * Roman pendant que l'italique, seul face non variable, passait très bien. La
 * signature était là depuis le début ; je ne l'ai lue qu'au troisième essai.
 *
 * À un Chrome de 2014, la même API sert des fontes **statiques** en `.woff` :
 * un fichier par graisse, aucun axe à instancier, rien à interpréter. Le PDF
 * les embarque telles quelles.
 *
 * Le coût est un format plus lourd que le WOFF2. Pour un document qu'on ouvre
 * pour l'imprimer, c'est exactement le bon échange.
 */
const AGENT =
  'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1700.107 Safari/537.36'

async function main() {
  const css = await fetch(FEUILLE, { headers: { 'User-Agent': AGENT } }).then((r) => {
    if (!r.ok) throw new Error(`Google Fonts a répondu ${r.status}`)
    return r.text()
  })

  /*
   * Une règle par face, sans découpage en sous-ensembles : c'est ce que rend
   * l'API à un vieil agent. Le bloc est gardé ENTIER — on n'en extrait rien,
   * on n'y remplace que l'adresse.
   */
  const blocs = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0])
  if (!blocs.length) throw new Error("Aucun bloc @font-face reconnu — l'API a dû changer de forme.")

  const regles = []
  let poids = 0

  for (const bloc of blocs) {
    const source = (bloc.match(/url\((https:\/\/[^)]+)\)/) || [])[1]
    if (!source) continue

    const octets = Buffer.from(
      await fetch(source, { headers: { 'User-Agent': AGENT } }).then((r) => r.arrayBuffer()),
    )
    if (octets.slice(0, 4).toString('latin1') !== 'wOFF') {
      throw new Error(`Ce n'est pas du WOFF : ${source}`)
    }
    poids += octets.length

    /*
     * `font-display: block` et non `swap` : ici on VEUT que le texte attende sa
     * police. C'est l'inverse du bon réglage sur un site — y faire patienter le
     * lecteur devant un texte invisible est une faute — et le bon réglage pour
     * une page dont le seul usage est d'être imprimée.
     */
    regles.push(
      bloc
        .replace(/url\(https:\/\/[^)]+\)/, `url("data:font/woff;base64,${octets.toString('base64')}")`)
        .replace(/font-display:\s*swap/, 'font-display: block'),
    )

    const famille = (bloc.match(/font-family:\s*'([^']+)'/) || [])[1]
    const graisse = (bloc.match(/font-weight:\s*([^;]+)/) || [])[1]
    const style = (bloc.match(/font-style:\s*([a-z]+)/) || [])[1]
    console.log(`  ↓ ${famille} ${graisse} ${style}  ${Math.round(octets.length / 1024)} Ko`)
  }

  if (!regles.length) throw new Error('Aucune police retenue.')
  const style = `<style id="polices-locales">\n${regles.join('\n')}\n</style>`

  for (const fichier of fs.readdirSync(DOSSIER).filter((f) => f.endsWith('.html'))) {
    const chemin = path.join(DOSSIER, fichier)
    let html = fs.readFileSync(chemin, 'utf8')

    // Idempotent : on remplace aussi bien le lien Google qu'un bloc déjà posé.
    const avant = html
    html = html
      .replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com"[^>]*>\s*/g, '')
      .replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com"[^>]*>\s*/g, '')
      .replace(/<style id="polices-locales">[\s\S]*?<\/style>/g, () => style)
      .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^"]*">/g, () => style)

    if (html === avant) continue
    fs.writeFileSync(chemin, html)
    console.log(`✓ ${fichier} embarque ses polices (${Math.round(poids / 1024)} Ko de fontes)`)
  }

  fs.rmSync(path.join(DOSSIER, 'polices'), { recursive: true, force: true })
}

main().catch((e) => {
  console.error('Échec :', e.message)
  process.exit(1)
})
