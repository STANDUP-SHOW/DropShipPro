/**
 * Tous les contrôles, en une commande.
 *
 *   cd backend && npm run controle            (tout sauf le parcours en production)
 *   cd backend && npm run controle -- --tout  (y compris le parcours, payant)
 *
 * **Pourquoi ça existe.** Vingt-six bancs se lançaient un par un, de mémoire.
 * Personne ne les lance tous — ni le vendeur, qui n'a pas à les connaître, ni
 * moi, qui finis par ne relancer que celui qui vient de rater. Un contrôle qu'on
 * ne lance pas ne protège de rien, et c'est ainsi qu'un défaut corrigé revient.
 *
 * Il n'y a donc plus qu'une commande, et elle dit en une ligne par banc ce qui
 * va et ce qui ne va pas. **Elle ne s'arrête jamais au premier échec** : un banc
 * qui tombe cache tous ceux d'après, et on répare alors une panne en ignorant
 * les quatre autres — l'erreur exactement, commise en écrivant `check-popup`.
 *
 * Le parcours de bout en bout est à part (`--tout`) : il crée un compte, appelle
 * la production, consomme des crédits d'IA et prend plusieurs minutes. Le
 * confondre avec les bancs locaux ferait renoncer à lancer les deux.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

const tout = process.argv.includes('--tout')

/**
 * Les bancs, découverts et non écrits à la main.
 *
 * Une liste écrite oublie le banc suivant — celui qu'on vient d'ajouter, donc
 * celui qui couvre la panne la plus fraîche. Le dossier fait foi.
 */
const bancs = readdirSync('.')
  .filter((f) => /^check-.*\.(ts|cjs)$/.test(f))
  // Le parcours appelle la production : il a sa propre place, plus bas.
  .filter((f) => f !== 'check-parcours.ts')
  .sort()

interface Resultat {
  banc: string
  ok: boolean
  resume: string
  secondes: number
}

function lancer(fichier: string): Resultat {
  const debut = Date.now()
  /*
   * Node lancé directement, jamais `npx`.
   *
   * `npx` est un script `.cmd` sous Windows : `spawnSync` ne sait pas
   * l'exécuter sans passer par le shell, et rendait trente-trois bancs « aucune
   * sortie » — un tableau entièrement rouge alors que tous passaient. Un lanceur
   * qui se trompe sur tout est plus dangereux qu'un lanceur absent : il fait
   * chercher des pannes qui n'existent pas.
   *
   * `--import tsx` charge le transpileur dans le processus Node, ce qui marche
   * partout de la même façon.
   */
  const cjs = fichier.endsWith('.cjs')
  const r = spawnSync(
    process.execPath,
    cjs ? [fichier] : ['--import', 'tsx', fichier],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )

  const sortie = `${r.stdout ?? ''}${r.stderr ?? ''}`
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('npm notice'))

  /*
   * Le dernier mot du banc, ou sa première erreur.
   *
   * Chaque banc conclut par une ligne qui résume. Quand il tombe avant, cette
   * ligne n'existe pas : on remonte alors la première ligne d'échec, qui est ce
   * qu'on veut lire — pas la trace de pile.
   */
  const echec = sortie.find((l) => /^(RATE|ECHEC|Error|.*échec\(s\))/i.test(l.trim()))
  /*
   * La ligne de conclusion, et non la dernière ligne.
   *
   * Certains bancs impriment après leur verdict — un avertissement, la fin d'un
   * objet JSON — et le tableau affichait alors « } » en face d'un banc qui
   * passait. Une conclusion illisible dans un récapitulatif de trente-trois
   * lignes, c'est trente-trois lignes qu'on cesse de lire.
   */
  const conclusion = [...sortie].reverse().find((l) => /tout passe|échec\(s\)/i.test(l))
  const resume =
    (r.status === 0 ? (conclusion ?? sortie.at(-1)) : (echec ?? conclusion ?? sortie.at(-1))) ??
    'aucune sortie'

  return {
    banc: fichier,
    ok: r.status === 0,
    resume: resume.trim().slice(0, 90),
    secondes: Math.round((Date.now() - debut) / 1000),
  }
}

console.log(`Contrôle complet — ${bancs.length} banc(s)${tout ? ' + le parcours en production' : ''}\n`)

const resultats: Resultat[] = []
for (const banc of bancs) {
  const r = lancer(banc)
  resultats.push(r)
  console.log(`${r.ok ? 'ok  ' : 'RATE'}  ${banc.padEnd(26)} ${r.resume}`)
}

if (tout) {
  console.log('')
  const r = lancer('check-parcours.ts')
  resultats.push(r)
  console.log(`${r.ok ? 'ok  ' : 'RATE'}  ${'check-parcours.ts'.padEnd(26)} ${r.resume} (${r.secondes} s)`)
}

const tombes = resultats.filter((r) => !r.ok)
console.log(
  tombes.length
    ? `\n${tombes.length} banc(s) en échec : ${tombes.map((r) => r.banc).join(', ')}`
    : '\nTout passe.',
)
process.exit(tombes.length ? 1 : 0)
