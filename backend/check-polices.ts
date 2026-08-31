import { preparerPolices, oublierPolices } from './src/services/fonts.js'

/**
 * Éprouve la préparation des polices.
 *
 * Le défaut corrigé ici n'était pas l'absence de polices — c'était un contrôle
 * qui répondait « tout va bien » dès qu'il trouvait un fichier `.ttf`, sur un
 * serveur où fontconfig ne les connaissait pas. Les publicités sortaient en
 * carrés, sans avertissement et avec les crédits débités : pire que pas de
 * contrôle du tout.
 *
 * Le banc tourne sur la machine de développement, qui a des polices. Il vérifie
 * ce qui est vérifiable sans serveur : que la configuration est écrite, qu'elle
 * désigne des dossiers réels, et que `FONTCONFIG_FILE` est posée — c'est elle
 * qui l'emporte sur la configuration du système.
 */

let echecs = 0
const exige = (condition: boolean, message: string) => {
  if (!condition) {
    echecs++
    console.log(`ECHEC : ${message}`)
  }
}

oublierPolices()
const etat = await preparerPolices()

console.log(`plateforme : ${process.platform}`)
console.log(`prêtes     : ${etat.pretes}`)
console.log(`dossiers   : ${etat.dossiers.length ? etat.dossiers.join('\n             ') : '—'}`)
console.log(`config     : ${etat.configuration ?? '—'}`)
if (etat.raison) console.log(`raison     : ${etat.raison}`)

if (process.platform === 'linux') {
  if (etat.pretes) {
    exige(etat.dossiers.length > 0, 'des polices prêtes doivent nommer leurs dossiers')
    exige(
      Boolean(etat.configuration) || Boolean(etat.raison),
      'sans configuration écrite, la raison doit le dire',
    )
    if (etat.configuration) {
      exige(
        process.env.FONTCONFIG_FILE === etat.configuration,
        'FONTCONFIG_FILE doit désigner la configuration écrite — sans elle, fontconfig lit celle du système et ignore /nix/store',
      )
      const { readFileSync } = await import('fs')
      const xml = readFileSync(etat.configuration, 'utf8')
      for (const d of etat.dossiers) {
        exige(xml.includes(`<dir>${d}</dir>`), `le dossier ${d} doit figurer dans la configuration`)
      }
      // Sans cache accessible en écriture, fontconfig relit toutes les polices
      // à chaque appel : quelques centaines de millisecondes par publicité.
      exige(xml.includes('<cachedir>'), 'un dossier de cache doit être déclaré')
    }
  } else {
    exige(Boolean(etat.raison), 'un serveur sans police doit dire où il a cherché')
  }
} else {
  // Windows et macOS fournissent leurs polices, et fontconfig n'y intervient
  // pas : c'est précisément pourquoi le défaut ne se voit jamais en
  // développement.
  exige(etat.pretes, 'hors Linux, les polices sont toujours disponibles')
}

// Le second appel doit être gratuit : il est fait avant chaque composition.
const debut = Date.now()
await preparerPolices()
exige(Date.now() - debut < 20, 'la préparation doit être mémorisée, pas refaite à chaque publicité')
// --- Le chemin Linux, forcé -------------------------------------------------
//
// C'est le seul qui casse, et le seul qu'une machine de développement ne prend
// jamais. `process.platform` est redéfini pour l'atteindre : sans ça, le banc
// valide un chemin qui n'a jamais servi en production.

console.log('\n--- chemin Linux forcé, avec une police embarquée ---')

const { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync: lire } = await import('fs')
const { resolve } = await import('path')

const dossierEmbarque = resolve('assets/fonts')
const factice = resolve('assets/fonts/.banc-police.ttf')
mkdirSync(dossierEmbarque, { recursive: true })
// Le contenu n'a aucune importance : la détection porte sur l'extension, et
// fontconfig n'est pas appelé ici.
writeFileSync(factice, 'police factice du banc')

Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
delete process.env.FONTCONFIG_FILE

try {
  oublierPolices()
  const linux = await preparerPolices()

  console.log(`prêtes     : ${linux.pretes}`)
  console.log(`dossiers   : ${linux.dossiers.join(' | ')}`)
  console.log(`config     : ${linux.configuration ?? '—'}`)

  exige(linux.pretes, 'une police dans assets/fonts doit suffire, quel que soit le serveur')
  exige(
    linux.dossiers[0] === dossierEmbarque,
    `le dossier embarqué doit passer en premier — c'est le seul dont on maîtrise le contenu (reçu : ${linux.dossiers[0]})`,
  )
  exige(Boolean(linux.configuration), 'une configuration fontconfig doit être écrite')
  exige(
    process.env.FONTCONFIG_FILE === linux.configuration,
    "FONTCONFIG_FILE doit désigner cette configuration : sans elle, fontconfig lit celle du système et ignore nos dossiers",
  )

  if (linux.configuration) {
    const xml = lire(linux.configuration, 'utf8')
    exige(xml.includes(`<dir>${dossierEmbarque}</dir>`), 'le dossier embarqué doit figurer dans le XML')
    exige(xml.includes('<cachedir>'), 'un cache doit être déclaré, sinon fontconfig relit tout à chaque publicité')
    exige(xml.includes('sans-serif'), 'une famille par défaut doit être posée pour les SVG qui demandent sans-serif')
  }
} finally {
  if (existsSync(factice)) rmSync(factice)
}

// --- Un serveur sans aucune police ------------------------------------------

console.log('\n--- chemin Linux forcé, sans aucune police ---')
oublierPolices()
const nu = await preparerPolices()
exige(!nu.pretes, 'sans police nulle part, la composition doit être refusée')
exige(
  Boolean(nu.raison) && nu.raison!.includes('nixpacks'),
  `la raison doit dire quoi vérifier, reçu : ${nu.raison}`,
)
console.log(`raison     : ${nu.raison}`)

console.log(echecs === 0 ? '\nPolices : tout passe.' : `\nPolices : ${echecs} echec(s).`)
process.exit(echecs === 0 ? 0 : 1)
