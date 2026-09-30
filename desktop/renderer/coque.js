'use strict'
/** La barre de gauche : navigation entre le site et les panneaux locaux, partage d'un lien. Données posées en `textContent`. */
const $ = (id) => document.getElementById(id)
const boutons = [...document.querySelectorAll('#barre > button')]

function marquer(bouton) {
  boutons.forEach((b) => b.classList.toggle('actif', b === bouton))
}

for (const b of boutons) {
  b.addEventListener('click', async () => {
    marquer(b)
    if (b.dataset.site) await window.coque.naviguer({ site: b.dataset.site })
    else await window.coque.naviguer({ panneau: b.dataset.panneau })
  })
}

async function partager(texte) {
  const url = String(texte || '').trim()
  if (!url) return
  $('retour').textContent = 'Envoi…'
  const r = await window.coque.partager(url)
  $('retour').textContent = r.ok ? 'Ajouté à la liste à importer.' : r.erreur || 'Lien refusé.'
  if (r.ok) $('lien').value = ''
}

$('lien').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') partager(e.target.value)
})
$('lien').addEventListener('paste', (e) => {
  const texte = e.clipboardData.getData('text')
  if (/^https?:\/\//i.test(texte.trim())) {
    e.preventDefault()
    partager(texte)
  }
})
$('capture').addEventListener('change', (e) => window.coque.capture(e.target.checked))

// Glisser-déposer d'un lien depuis un navigateur : la fenêtre entière l'accepte.
let compteur = 0
document.addEventListener('dragenter', (e) => {
  e.preventDefault()
  compteur++
  $('depot').hidden = false
})
document.addEventListener('dragover', (e) => e.preventDefault())
document.addEventListener('dragleave', () => {
  compteur = Math.max(0, compteur - 1)
  if (!compteur) $('depot').hidden = true
})
document.addEventListener('drop', (e) => {
  e.preventDefault()
  compteur = 0
  $('depot').hidden = true
  const texte = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
  partager(String(texte || '').split('\n')[0])
})

function rendre(etat) {
  if (!etat) return
  $('compte').textContent = etat.compte ? `Relié : ${etat.compte}` : 'Connectez-vous sur le site : ce poste se relie tout seul.'
  $('nb-partages').textContent = etat.nbLiens ? String(etat.nbLiens) : ''
  $('nb-annonces').textContent = etat.nbAnnonces ? String(etat.nbAnnonces) : ''
  $('nb-achats').textContent = etat.nbAchats ? String(etat.nbAchats) : ''
  $('capture').checked = Boolean(etat.capture)
  if (etat.dernierPartage) $('retour').textContent = etat.dernierPartage
}

window.coque.surEtat(rendre)
window.coque.etat().then(rendre)
