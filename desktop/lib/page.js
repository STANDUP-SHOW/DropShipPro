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

/**
 * Clique le premier bouton (ou lien, ou option de variante) dont le texte visible vaut
 * l'un des mots, dans l'ordre des mots. `interdits` : des motifs (texte de regex) qu'on
 * ne clique JAMAIS — le paiement. Rend le texte cliqué, ou null.
 */
function cliquerTexte(mots, interdits, exact) {
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const st = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'
  }
  const candidats = [...document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"], label, li, span, div')].filter((el) => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true')
  const texteDe = (el) => norm(el.tagName === 'INPUT' ? el.value : el.innerText)
  const interdit = (t) => (interdits || []).some((re) => new RegExp(re, 'i').test(t))
  for (const mot of mots) {
    const m = norm(mot)
    // The smallest element whose text matches: a big container also "contains" the words.
    const trouves = candidats.filter((el) => {
      const t = texteDe(el)
      return t && t.length <= 80 && (exact ? t === m : t === m || t.startsWith(m + ' ') || t.startsWith(m)) && !interdit(t)
    })
    if (!trouves.length) continue
    const el = trouves.sort((a, b) => texteDe(a).length - texteDe(b).length || (a.contains(b) ? 1 : -1))[0]
    el.click()
    return texteDe(el)
  }
  return null
}

/** Remplit un formulaire d'adresse : chaque champ reconnu par autocomplete, name/id, libellé ou placeholder. Rend les clés posées. */
function remplirAdresse(champs) {
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const inputs = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=password]), select, textarea')].filter((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && !el.disabled && !el.readOnly
  })
  const contexte = (el) => {
    const label = el.labels && el.labels[0] ? el.labels[0].innerText : el.closest('label') ? el.closest('label').innerText : ''
    return norm([el.getAttribute('aria-label'), el.placeholder, el.name, el.id, label, el.parentElement ? el.parentElement.innerText.slice(0, 60) : ''].filter(Boolean).join(' | '))
  }
  const pris = new Set()
  const poser = (el, valeur) => {
    if (el.tagName === 'SELECT') {
      const opt = [...el.options].find((o) => norm(o.text) === norm(valeur) || norm(o.value) === norm(valeur)) || [...el.options].find((o) => norm(o.text).includes(norm(valeur)))
      if (!opt) return false
      el.value = opt.value
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    }
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valeur)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }
  const poses = []
  // Pass 1: autocomplete (the standard, exact). Pass 2: words in name/id/label/placeholder.
  for (const passe of ['autocomplete', 'mots']) {
    for (const champ of champs) {
      if (poses.includes(champ.cle)) continue
      let el = null
      if (passe === 'autocomplete') el = inputs.find((i) => !pris.has(i) && champ.autocomplete.includes((i.getAttribute('autocomplete') || '').toLowerCase()))
      else {
        const mots = champ.mots.map(norm)
        el = inputs.find((i) => !pris.has(i) && !i.getAttribute('autocomplete') && mots.some((m) => (m.length <= 3 ? new RegExp('(^|[^a-z])' + m + '([^a-z]|$)').test(contexte(i)) : contexte(i).includes(m))))
      }
      if (el && poser(el, champ.valeur)) {
        pris.add(el)
        poses.push(champ.cle)
      }
    }
  }
  return poses
}

/** Ce que la page montre : champ mot de passe (session absente), écran de paiement, texte visible. */
function signesPage(signesPaiement) {
  const texte = document.body ? document.body.innerText.slice(0, 6000) : ''
  const paiement = signesPaiement.champs.some((s) => document.querySelector(s)) || signesPaiement.textes.some((re) => new RegExp(re, 'i').test(texte))
  return { url: location.href, titre: document.title, texte: texte.slice(0, 4000), motDePasse: !!document.querySelector('input[type="password"]'), paiement }
}

/** L'appel prêt à envoyer à la page : la fonction en texte, ses arguments en JSON. */
const appelPage = (fonction, ...args) => `(${fonction.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`

module.exports = { poserValeur, lireOptions, cliquerOption, cliquerBouton, cliquerTexte, remplirAdresse, signesPage, appelPage }
