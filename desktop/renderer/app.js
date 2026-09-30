'use strict'
/**
 * L'écran. Tout ce qui vient du serveur ou d'une page (adresses, titres,
 * raisons) est du DONNÉE : posé par `textContent`, jamais par `innerHTML`.
 */
const $ = (id) => document.getElementById(id)

function el(tag, options = {}, ...enfants) {
  const n = document.createElement(tag)
  if (options.classe) n.className = options.classe
  if (options.texte !== undefined) n.textContent = options.texte
  if (options.clic) n.addEventListener('click', options.clic)
  if (options.type) n.type = options.type
  enfants.forEach((e) => e && n.append(e))
  return n
}

const heure = (iso) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const LIBELLES = { publication: 'Publication', alerte: 'Alerte', accord: 'Accord donné', 'accord-retire': 'Accord retiré', reprise: 'Reprise' }

function rendreLiens(etat) {
  const ul = $('liens')
  ul.replaceChildren()
  $('nb-liens').textContent = etat.liens.length ? `(${etat.liens.length})` : ''
  $('vide').hidden = etat.liens.length > 0
  $('erreur').textContent = etat.erreur || ''
  for (const l of etat.liens) {
    ul.append(
      el(
        'li',
        {},
        el('span', { classe: 'url', texte: l.title || l.url }),
        el(
          'span',
          { classe: 'actions' },
          el('button', { texte: 'Ouvrir', type: 'button', clic: async () => rendre(await window.desktop.ouvrirLien(l.id)) }),
          el('button', { texte: 'Terminé', type: 'button', classe: 'principal', clic: async () => rendre(await window.desktop.lienTermine(l.id)) }),
        ),
      ),
    )
  }
}

function rendrePlateformes(etat) {
  const zone = $('plateformes')
  zone.replaceChildren()
  for (const p of etat.plateformes) {
    const bloc = el('div', { classe: 'plateforme' })
    const tete = el('header', {}, el('h3', { texte: p.nom }))
    if (p.arret) tete.append(el('span', { classe: 'pastille arret', texte: 'Arrêtée' }))
    else if (p.accord) tete.append(el('span', { classe: 'pastille ok', texte: 'Mode automatique actif' }))
    bloc.append(tete)
    bloc.append(el('button', { texte: `Ouvrir ${p.nom}`, type: 'button', clic: () => window.desktop.ouvrirSession(p.id) }))

    if (p.arret) {
      bloc.append(
        el('p', { classe: 'erreur', texte: `Arrêt : ${p.arret.raison}. Réglez la vérification sur ${p.nom} vous-même, puis reprenez.` }),
        el('button', { texte: 'J’ai réglé la vérification — reprendre', type: 'button', clic: async () => rendre(await window.desktop.reprendre(p.id)) }),
      )
    } else if (p.accord) {
      bloc.append(
        el('p', { classe: 'discret', texte: `Plafond ${p.plafond} annonces par jour, ${p.espacementMin} min entre deux. Accord donné le ${heure(p.accord)}.` }),
        el('p', { classe: 'discret', texte: p.decision.ok ? 'Prêt à publier.' : p.decision.raison }),
        el('button', { texte: 'Retirer mon accord', type: 'button', classe: 'danger', clic: async () => rendre(await window.desktop.retirerAccord(p.id)) }),
      )
    } else {
      const case_ = el('input', { type: 'checkbox' })
      const bouton = el('button', { texte: 'Activer le mode automatique', type: 'button', classe: 'principal', clic: async () => rendre(await window.desktop.accorder(p.id)) })
      bouton.disabled = true
      case_.addEventListener('change', () => (bouton.disabled = !case_.checked))
      bloc.append(
        el(
          'div',
          { classe: 'accord' },
          el('div', { texte: etat.texteAccord }),
          el('label', {}, case_, el('span', { texte: `Je comprends le risque et je demande le mode automatique sur ${p.nom}.` })),
        ),
        bouton,
      )
    }
    zone.append(bloc)
  }
}

function rendreJournal(etat) {
  const ul = $('journal')
  ul.replaceChildren()
  if (!etat.journal.length) return ul.append(el('li', { texte: 'Aucun événement pour le moment.' }))
  for (const e of etat.journal) {
    ul.append(el('li', {}, el('span', { texte: `${LIBELLES[e.type] || e.type} — ${e.plateforme || ''}${e.raison ? ` (${e.raison})` : ''}` }), el('span', { texte: heure(e.at) })))
  }
}

function rendre(etat) {
  if (!etat) return
  $('connexion').hidden = etat.connecte
  $('tableau').hidden = !etat.connecte
  $('compte').textContent = etat.connecte ? etat.apiBase.replace(/^https?:\/\//, '') : ''
  if (!etat.connecte) return
  rendreLiens(etat)
  rendrePlateformes(etat)
  rendreJournal(etat)
}

$('relier').addEventListener('click', async () => {
  const r = await window.desktop.poserCle($('cle').value)
  $('erreur-cle').textContent = r.ok ? '' : r.erreur
  if (r.ok) {
    $('cle').value = ''
    rendre(await window.desktop.etat())
  }
})

window.desktop.surEtat(rendre)
window.desktop.etat().then(rendre)
