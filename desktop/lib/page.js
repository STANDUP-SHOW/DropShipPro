'use strict'
/**
 * Les fonctions exécutées DANS la page de la place de marché.
 *
 * Elles sont écrites comme de vraies fonctions (relues, vérifiables) puis envoyées
 * en texte par le pilote : aucune ne voit Node ni les variables de ce fichier, tout
 * leur arrive par arguments. Elles posent des valeurs et cliquent, rien d'autre :
 * pas de geste simulé, pas de délai aléatoire (CLAUDE.md, décision du 29/09/2026).
 */

/** Pose une valeur comme une saisie, pour que React la voie. `cible` : { selecteurs } ou { libelles }. */
function poserValeur(cible, valeur) {
  const premiereLigne = (s) => (s || '').trim().split(/\r?\n/)[0].trim()
  let el = null
  if (cible.libelles) {
    const label = [...document.querySelectorAll('label')].find((l) => cible.libelles.includes(premiereLigne(l.innerText)))
    el = label ? label.querySelector('input, textarea') : null
  } else {
    el = cible.selecteurs.map((s) => document.querySelector(s)).find(Boolean) || null
  }
  if (!el) return false
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valeur)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

/** Ouvre une liste déroulante repérée par son libellé et rend les options proposées (null : liste introuvable). */
async function lireOptions(liste, attenteMs) {
  const premiereLigne = (s) => (s || '').trim().split(/\r?\n/)[0].trim()
  const nom = (o) => {
    let t = premiereLigne(o.innerText)
    for (const suffixe of liste.suffixes || []) if (t.endsWith(suffixe)) t = t.slice(0, -suffixe.length).trim()
    return t
  }
  const lire = () => {
    const menu = document.querySelector(liste.menu)
    return menu ? [...menu.querySelectorAll(liste.option)].map(nom).filter(Boolean) : null
  }
  let options = lire()
  if (!options || !options.length) {
    const bouton = [...document.querySelectorAll(liste.bouton)].find((b) => liste.libelles.includes(premiereLigne(b.innerText)))
    if (!bouton) return null
    bouton.click()
    const fin = Date.now() + attenteMs
    while (Date.now() < fin) {
      await new Promise((ok) => setTimeout(ok, 200))
      options = lire()
      if (options && options.length) break
    }
  }
  return options && options.length ? options : null
}

/** Clique l'option voulue dans la liste déjà ouverte. */
function cliquerOption(liste, voulu) {
  const premiereLigne = (s) => (s || '').trim().split(/\r?\n/)[0].trim()
  const menu = document.querySelector(liste.menu)
  if (!menu) return false
  const option = [...menu.querySelectorAll(liste.option)].find((o) => {
    let t = premiereLigne(o.innerText)
    for (const suffixe of liste.suffixes || []) if (t.endsWith(suffixe)) t = t.slice(0, -suffixe.length).trim()
    return t === voulu
  })
  if (!option) return false
  option.click()
  return true
}

/** 'clic' si un bouton actif a été cliqué, 'inactif' s'il existe mais grisé, 'absent' sinon. */
function cliquerBouton(selecteurs) {
  const el = selecteurs.map((s) => document.querySelector(s)).find(Boolean)
  if (!el) return 'absent'
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') return 'inactif'
  el.click()
  return 'clic'
}

/** L'appel prêt à envoyer à la page : la fonction en texte, ses arguments en JSON. */
const appelPage = (fonction, ...args) => `(${fonction.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`

module.exports = { poserValeur, lireOptions, cliquerOption, cliquerBouton, appelPage }
