'use strict'
/**
 * Choisir une option dans une liste déroulante lue SUR LA PAGE (catégorie, état).
 *
 * La liste n'est pas écrite en dur : le pilote ouvre le menu, lit les libellés
 * réellement proposés, et cette fonction pure dit lequel cliquer. Quand rien ne
 * correspond, elle rend `null` : le champ reste « à compléter par vous », jamais
 * une catégorie au hasard.
 */

const normaliser = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’']/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const VIDES = new Set(['et', 'de', 'des', 'du', 'la', 'le', 'les', 'pour', 'en', 'a', 'au', 'aux', 'd', 'l', 'un', 'une', 'avec', 'sans', 'autres'])
/** Racine grossière : pluriels et accords ne doivent pas empêcher un rapprochement. */
const racine = (m) => (m.length > 4 ? m.replace(/(es|s|x)$/, '') : m)
const mots = (s) => normaliser(s).split(' ').filter((m) => m.length > 1 && !VIDES.has(m)).map(racine)

/**
 * Mots d'une annonce → mots qu'on trouve dans les libellés des places de marché.
 * Volontairement court : il complète le rapprochement direct, il ne le remplace pas.
 */
const SYNONYMES = {
  lampe: ['maison'], luminaire: ['maison'], eclairage: ['maison'], decoration: ['maison'], deco: ['maison'], cuisine: ['maison'], rangement: ['maison'], linge: ['maison'],
  canape: ['meuble'], chaise: ['meuble'], table: ['meuble'], etagere: ['meuble'], bureau: ['meuble'], mobilier: ['meuble'],
  robe: ['vetement', 'femme'], jupe: ['vetement', 'femme'], chemise: ['vetement'], pantalon: ['vetement'], veste: ['vetement'], pull: ['vetement'], basket: ['chaussure', 'vetement'], mode: ['vetement'], habillement: ['vetement'],
  collier: ['bijoux'], bracelet: ['bijoux'], montre: ['bijoux', 'accessoire'], bague: ['bijoux'], lunette: ['accessoire'],
  smartphone: ['telephone', 'mobile'], iphone: ['telephone', 'mobile'], coque: ['telephone', 'mobile'],
  ordinateur: ['electronique'], informatique: ['electronique', 'ordinateur'], casque: ['electronique'], ecouteur: ['electronique'], enceinte: ['electronique'], tablette: ['electronique'], camera: ['electronique'], high: ['electronique'],
  console: ['jeux', 'video'], manette: ['jeux', 'video'],
  jouet: ['jouet', 'jeux'], peluche: ['jouet'], puzzle: ['jouet', 'jeux'],
  bebe: ['puericulture', 'enfant'], poussette: ['puericulture'],
  chien: ['animaux'], chat: ['animaux'], animal: ['animaux'], animalerie: ['animaux'],
  maquillage: ['beaute'], parfum: ['beaute'], soin: ['sante', 'beaute'], cosmetique: ['beaute'],
  perceuse: ['outil'], bricolage: ['outil'], tournevis: ['outil'],
  plante: ['jardin'], arrosage: ['jardin'], tondeuse: ['jardin'], exterieur: ['jardin'],
  aspirateur: ['electromenager'], cafetiere: ['electromenager'], mixeur: ['electromenager'],
  valise: ['bagage', 'sac'], sac: ['sac'],
  livre: ['livre'], dvd: ['film'], vinyle: ['musique'],
  velo: ['velo', 'sport'], fitness: ['sport'], musculation: ['sport'], camping: ['sport', 'exterieur'],
  voiture: ['auto', 'automobile'], moto: ['auto', 'moto'],
}

function enrichir(liste) {
  const tout = new Set(liste)
  for (const m of liste) for (const s of SYNONYMES[m] ?? []) tout.add(racine(s))
  return tout
}

/**
 * La catégorie : d'abord le chemin de catégorie de l'annonce (dernier niveau = le
 * plus précis, il compte double), puis son titre. Une option qui ne partage aucun
 * mot n'est jamais choisie ; à défaut, l'un des libellés « fourre-tout » s'il existe.
 */
function choisirCategorie(options, annonce, fourreTout = []) {
  const niveaux = String(annonce.category ?? '').split(/[>/]/).map((n) => n.trim()).filter(Boolean)
  const precis = enrichir(mots(niveaux[niveaux.length - 1] ?? ''))
  const chemin = enrichir(mots(niveaux.join(' ')))
  const titre = enrichir(mots(annonce.title))

  let meilleure = null
  let score = 0
  for (const option of options) {
    const o = mots(option)
    if (!o.length) continue
    let s = 0
    for (const m of o) s += (precis.has(m) ? 4 : 0) + (chemin.has(m) ? 2 : 0) + (titre.has(m) ? 1 : 0)
    if (s > score) {
      score = s
      meilleure = option
    }
  }
  if (meilleure) return meilleure
  const secours = fourreTout.map(normaliser)
  return options.find((o) => secours.includes(normaliser(o))) ?? null
}

/** L'état : le libellé exact, sinon la première option qui le contient (« Bon état » → « D'occasion - bon état »). */
function choisirEtat(options, voulu) {
  const v = normaliser(voulu)
  if (!v) return null
  return options.find((o) => normaliser(o) === v) ?? options.find((o) => normaliser(o).endsWith(v)) ?? options.find((o) => normaliser(o).includes(v)) ?? null
}

/**
 * Le prix tel que le champ de la plateforme l'attend. « entier » : Facebook et Leboncoin affichent des prix
 * sans centimes, et un champ qui ne garde que les chiffres ferait de « 24.9 » un « 249 » ; on arrondit donc
 * à l'euro le plus proche. « virgule » : décimale française, deux chiffres (« 24,90 »), entier laissé tel quel.
 */
function formaterPrix(prix, mode) {
  const n = Number(prix)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (mode === 'entier') return String(Math.max(1, Math.round(n)))
  if (mode === 'virgule') return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',')
  return String(n)
}

module.exports = { choisirCategorie, choisirEtat, formaterPrix, normaliser }
