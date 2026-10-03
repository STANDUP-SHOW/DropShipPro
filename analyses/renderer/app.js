'use strict'
/* The screen. Data is only ever put in with textContent: nothing from a report or a site is parsed as HTML. */

const ONGLETS = [
  ['accueil', 'Tableau de bord'],
  ['rapports', 'Rapports du jour'],
  ['sources', 'Sources & navigateur'],
  ['reglages', 'Réglages'],
  ['journal', 'Journal'],
]
let onglet = 'accueil'
let etat = null
let sourceChoisie = null
let messageFlash = ''

function h(tag, attrs, ...enfants) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'value') el.value = v
    else if (k === 'checked') el.checked = Boolean(v)
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const e of enfants.flat()) if (e !== null && e !== undefined && e !== false) el.append(e.nodeType ? e : document.createTextNode(String(e)))
  return el
}

const pastille = (texte, type) => h('span', { class: `pastille ${type || ''}` }, texte)

async function appel(nom, arg) {
  const r = await window.poste[nom](arg)
  if (!r.ok) { flash(r.erreur); return null }
  return r.valeur
}

function flash(m) { messageFlash = m; rendre() }

// ---------------------------------------------------------------- tableau de bord
function vueAccueil() {
  const e = etat
  const cles = e.secrets
  const toutesCles = cles.anthropic && cles.serper
  const prog = e.nuit.progression
  const b = e.nuit.dernierBilan
  const faits = e.rayonsDuJour.filter((r) => r.fait).length

  return h('div', {},
    h('h1', {}, 'Tableau de bord'),
    h('div', { class: 'grille' },
      h('div', { class: 'carte' },
        h('h2', {}, 'Prêt à travailler ?'),
        h('div', {}, 'Clé Anthropic ', pastille(cles.anthropic ? 'posée' : 'absente', cles.anthropic ? 'bon' : 'mauvais')),
        h('div', {}, 'Clé Serper ', pastille(cles.serper ? 'posée' : 'absente', cles.serper ? 'bon' : 'mauvais')),
        h('div', {}, 'Sources de données ', pastille(String(e.sources.length), e.sources.length ? 'bon' : '')),
        !toutesCles && h('p', { class: 'doux petit' }, 'Posez vos clés dans Réglages : elles restent chiffrées sur ce PC.'),
      ),
      h('div', { class: 'carte' },
        h('h2', {}, `Aujourd’hui (${e.date})`),
        h('div', {}, `${faits} / ${e.rayonsDuJour.length} rapports validés`),
        h('div', { class: 'barre-prog' }, h('div', { style: `width:${Math.round((faits / e.rayonsDuJour.length) * 100)}%` })),
        h('p', { class: 'doux petit' }, e.reglages.nuitActivee ? `Nuit automatique à ${e.reglages.heureNuit} : ACTIVÉE` : 'Nuit automatique : désactivée (rien ne tourne sans votre accord).'),
      ),
    ),
    h('div', { class: 'carte' },
      h('h2', {}, 'Actions'),
      h('div', { class: 'ligne' },
        h('button', { class: 'btn', onclick: async () => {
          flash('Contrôle en cours…')
          const r = await appel('credits')
          if (r) flash(`Anthropic : ${r.claude.ok ? 'OK' : r.claude.message} — Serper : ${r.serper.ok ? 'OK' : r.serper.message}`)
        } }, 'Contrôler les crédits (1 crédit)'),
        h('button', { class: 'btn principal', disabled: e.nuit.enCours || !toutesCles, onclick: async () => { const r = await appel('rayonTest'); if (r && !r.annule) flash(`Rayon test : ${r.statut}`) } }, 'Lancer UN rayon test'),
        h('button', { class: 'btn', disabled: e.nuit.enCours || !toutesCles, onclick: async () => { const r = await appel('nuitLancer'); if (r && !r.annule) flash(r.annulee ? `Nuit annulée : ${r.annulee}` : 'Nuit terminée') } }, 'Lancer la nuit complète'),
        h('button', { class: 'btn danger', disabled: !e.nuit.enCours, onclick: () => appel('nuitArreter') }, 'Arrêter après le rayon en cours'),
      ),
      prog && h('p', {}, `En cours : ${prog.courant || '…'} ${prog.index ? `(${prog.index}/${prog.attendus})` : ''}`),
      messageFlash && h('p', { class: 'petit' }, messageFlash),
    ),
    b && h('div', { class: 'carte' },
      h('h2', {}, 'Dernière exécution'),
      b.test
        ? h('div', {}, `Rayon test ${b.rayon} : `, pastille(b.statut, b.statut === 'ok' ? 'bon' : 'mauvais'), (b.problemes || []).length ? h('ul', {}, b.problemes.map((p) => h('li', {}, p))) : null)
        : h('div', {}, b.annulee ? `Annulée avant toute dépense : ${b.annulee}` : `${b.ok} validés, ${b.aRevoir} à revoir, ${(b.erreurs || []).length} erreur(s), ${b.ignores || 0} déjà faits${b.arretee ? ` — arrêtée : ${b.arretee}` : ''}`),
    ),
    h('div', { class: 'carte' },
      h('h2', {}, 'Nuit automatique'),
      h('p', { class: 'doux petit' }, 'À n’activer qu’après un rayon test dont vous avez validé la qualité (20 produits, 20 URL distinctes, marges en euros). Coût d’une nuit : environ 9,40 €.'),
      h('div', { class: 'ligne' },
        h('button', { class: 'btn', onclick: () => appel('nuitAuto', { actif: !e.reglages.nuitActivee }) }, e.reglages.nuitActivee ? 'Désactiver la nuit automatique' : `Activer la nuit automatique à ${e.reglages.heureNuit}`),
      ),
    ),
  )
}

// ---------------------------------------------------------------- rapports
function vueRapports() {
  const e = etat
  return h('div', {},
    h('h1', {}, `Rapports du ${e.date}`),
    h('div', { class: 'ligne' }, h('button', { class: 'btn', onclick: () => appel('depotOuvrir') }, 'Ouvrir le dossier de dépôt'), h('span', { class: 'doux petit' }, e.depot)),
    h('div', { class: 'carte' },
      h('table', {},
        h('thead', {}, h('tr', {}, ['Catégorie', 'Thème du jour', 'État', 'Produits', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, e.rayonsDuJour.map((r) => {
          const rap = e.rapports.find((x) => x.categorie === r.categorie && x.theme === r.theme)
          return h('tr', {},
            h('td', {}, r.libelleCategorie),
            h('td', {}, r.libelleTheme),
            h('td', {}, rap ? pastille(rap.statut === 'ok' ? 'validé' : 'à revoir', rap.statut === 'ok' ? 'bon' : 'alerte') : pastille('pas encore', ''), rap && rap.problemes.length ? h('div', { class: 'petit doux' }, rap.problemes.join(' · ')) : null),
            h('td', {}, rap ? String(rap.produits) : '—'),
            h('td', {}, rap ? h('div', { class: 'ligne' },
              h('button', { class: 'btn', onclick: () => appel('rapportOuvrir', { categorie: r.categorie, theme: r.theme, type: 'rayon' }) }, 'Rayon'),
              h('button', { class: 'btn', onclick: () => appel('rapportOuvrir', { categorie: r.categorie, theme: r.theme, type: 'marketing' }) }, 'Marketing'),
            ) : null),
          )
        })),
      ),
    ),
  )
}

// ---------------------------------------------------------------- sources & navigateur
function vueSources() {
  const e = etat
  const choisie = e.sources.find((s) => s.id === sourceChoisie)
  const zone = h('div', { id: 'zone-nav' }, choisie ? '' : 'Choisissez une source pour l’ouvrir dans le navigateur privé.')
  const champ = h('input', { id: 'url-nav', placeholder: 'https://…' })

  const liste = h('div', { class: 'liste' },
    h('h2', {}, 'Vos sources'),
    e.sources.length === 0 ? h('p', { class: 'doux petit' }, 'Aucune source. Ajoutez une bibliothèque de publicités, un site de tendances…') : null,
    e.sources.map((s) => h('div', { class: `source ${s.id === sourceChoisie ? 'actif' : ''}`, onclick: () => { sourceChoisie = s.id; rendre() } },
      h('strong', {}, s.nom), h('br'),
      s.session ? pastille(s.session.etat === 'connecte' ? 'connectée' : s.session.etat === 'bloque' ? 'bloquée' : s.session.etat === 'deconnecte' ? 'déconnectée' : s.session.etat, s.session.etat === 'connecte' ? 'bon' : 'mauvais') : pastille('non vérifiée', ''),
      h('div', { class: 'petit doux' }, `${s.pages.length} page(s) relevée(s) chaque nuit`),
    )),
    h('h2', {}, 'Ajouter une source'),
    h('label', {}, 'Nom'), h('input', { id: 'f-nom', placeholder: 'Ex. Ads Library Facebook' }),
    h('label', {}, 'Adresse de connexion'), h('input', { id: 'f-url', placeholder: 'https://…' }),
    h('label', {}, 'Pages à relever chaque nuit (une par ligne, facultatif)'), h('textarea', { id: 'f-pages', rows: '3' }),
    h('label', {}, 'Texte qui prouve la déconnexion (facultatif)'), h('input', { id: 'f-deco', placeholder: 'Ex. Se connecter' }),
    h('p', {}, h('button', { class: 'btn principal', onclick: async () => {
      const r = await appel('sourceAjouter', {
        nom: document.getElementById('f-nom').value,
        urlConnexion: document.getElementById('f-url').value,
        pages: document.getElementById('f-pages').value,
        texteDeconnecte: document.getElementById('f-deco').value,
      })
      if (r) { etat = r; messageFlash = ''; rendre() }
    } }, 'Ajouter')),
  )

  const vue = h('div', { class: 'vue' },
    h('h1', {}, choisie ? choisie.nom : 'Navigateur privé'),
    choisie && h('div', { class: 'ligne' },
      h('button', { class: 'btn', onclick: () => appel('navAction', { action: 'retour' }) }, '←'),
      h('button', { class: 'btn', onclick: () => appel('navAction', { action: 'avance' }) }, '→'),
      h('button', { class: 'btn', onclick: () => appel('navAction', { action: 'recharger' }) }, '↻'),
      h('div', { style: 'flex:1;min-width:200px' }, champ),
      h('button', { class: 'btn', onclick: () => appel('navAction', { action: 'aller', url: champ.value }) }, 'Aller'),
      h('button', { class: 'btn', onclick: async () => { flash('Vérification…'); const r = await appel('sourceVerifier', choisie.id); if (r) flash(`Session : ${r.etat} — ${r.raison}`) } }, 'Vérifier la session'),
      h('button', { class: 'btn danger', onclick: async () => { if (confirm(`Supprimer la source « ${choisie.nom} » ?`)) { const r = await appel('sourceSupprimer', choisie.id); if (r) { sourceChoisie = null; etat = r; rendre() } } } }, 'Supprimer'),
    ),
    choisie && h('p', { class: 'petit doux' }, 'Connectez-vous vous-même dans cette fenêtre : le poste garde la session sur ce PC et vous prévient si le site la coupe. Aucun mot de passe n’est lu ni enregistré.'),
    messageFlash && h('p', { class: 'petit' }, messageFlash),
    zone,
  )
  queueMicrotask(() => placerNavigateur(zone, choisie))
  return h('div', { class: 'sources' }, liste, vue)
}

let dernierPlace = null
function placerNavigateur(zone, choisie) {
  if (!choisie) { appel('navMasquer'); dernierPlace = null; return }
  const r = zone.getBoundingClientRect()
  const bounds = { x: r.left, y: r.top, width: r.width, height: r.height }
  if (dernierPlace !== choisie.id) { dernierPlace = choisie.id; window.poste.navAfficher({ id: choisie.id, bounds }) }
  else window.poste.navPlacer(bounds)
}
window.addEventListener('resize', () => { if (onglet === 'sources') rendre() })

// ---------------------------------------------------------------- réglages
function vueReglages() {
  const e = etat
  const r = e.reglages
  const cle = (nom, titre) => {
    const champ = h('input', { type: 'password', placeholder: e.secrets[nom] ? '•••••••• (posée — saisissez pour remplacer)' : 'Collez votre clé', autocomplete: 'off' })
    return h('div', {},
      h('label', {}, titre, ' ', pastille(e.secrets[nom] ? 'posée' : 'absente', e.secrets[nom] ? 'bon' : 'mauvais')),
      h('div', { class: 'ligne' },
        h('div', { style: 'flex:1;min-width:220px' }, champ),
        h('button', { class: 'btn', onclick: async () => { if (!champ.value.trim()) return; const x = await appel('secret', { nom, valeur: champ.value }); champ.value = ''; if (x) { etat = x; flash('Clé enregistrée (chiffrée).') } } }, 'Enregistrer'),
        e.secrets[nom] && h('button', { class: 'btn danger', onclick: async () => { const x = await appel('secret', { nom, valeur: '' }); if (x) { etat = x; rendre() } } }, 'Effacer'),
      ),
    )
  }
  const champs = {}
  const f = (id, titre, valeur, type) => { champs[id] = h('input', { value: valeur, type: type || 'text' }); return h('div', {}, h('label', {}, titre), champs[id]) }
  const envoi = h('input', { type: 'checkbox', checked: r.envoiAuSite })
  const sp = r.signauxPublics
  const caseMeta = h('input', { type: 'checkbox', checked: sp.meta })
  const caseTrends = h('input', { type: 'checkbox', checked: sp.trends })
  return h('div', {},
    h('h1', {}, 'Réglages'),
    h('div', { class: 'carte' },
      h('h2', {}, 'Clés (saisies par vous, chiffrées par Windows, jamais réaffichées)'),
      cle('anthropic', 'Clé API Anthropic'), cle('serper', 'Clé API Serper'), cle('agent', 'Clé d’agent du site (facultatif, pour l’envoi)'),
    ),
    h('div', { class: 'carte' },
      h('h2', {}, 'Agents'),
      f('modele', 'Modèle Claude', r.modele),
      f('espaceAnthropic', 'Identifiant d’espace de travail Anthropic (seulement si l’API répond « not scoped to a workspace »)', r.espaceAnthropic || ''),
      f('heureNuit', 'Heure de la nuit (HH:MM)', r.heureNuit),
      f('plafondPages', 'Pages lues par rayon', r.plafondPages, 'number'),
      f('plafondDeuxiemeVague', 'Modèles cherchés en deuxième vague (plafond Serper)', r.plafondDeuxiemeVague, 'number'),
      h('label', {}, h('span', {}, envoi, ' Envoyer aussi chaque rapport validé au site drop-shipper.fr')),
      h('label', {}, h('span', {}, caseTrends, ' Lire Google Trends (courbe de recherche du thème et des modèles, France 12 mois)')),
      h('label', {}, h('span', {}, caseMeta, ' Lire la Meta Ad Library (annonces actives par modèle)')),
      f('plafondPubs', 'Modèles cherchés dans la Meta Ad Library par rayon', sp.plafondPubsParRayon, 'number'),
      h('p', { class: 'doux petit' }, 'Lectures publiques dans une fenêtre cachée, espacées de 4 s ; le premier blocage ou la première demande de connexion arrête la source pour la nuit. Vérifiez les conditions d’utilisation de ces sites.'),
      f('apiBase', 'Adresse de l’API', r.apiBase),
      h('p', {}, h('button', { class: 'btn principal', onclick: async () => {
        const x = await appel('reglages', {
          modele: champs.modele.value.trim(), espaceAnthropic: champs.espaceAnthropic.value.trim(), heureNuit: champs.heureNuit.value.trim(), plafondPages: Number(champs.plafondPages.value),
          plafondDeuxiemeVague: Number(champs.plafondDeuxiemeVague.value), apiBase: champs.apiBase.value.trim(), envoiAuSite: envoi.checked,
          signauxPublics: { meta: caseMeta.checked, trends: caseTrends.checked, plafondPubsParRayon: Number(champs.plafondPubs.value) },
        })
        if (x) { etat = x; flash('Réglages enregistrés.') }
      } }, 'Enregistrer les réglages')),
      messageFlash && h('p', { class: 'petit' }, messageFlash),
    ),
    h('div', { class: 'carte' }, h('h2', {}, 'Dossier de dépôt'), h('div', {}, e.depot), h('p', { class: 'doux petit' }, 'Créé par l’installateur. Le désinstaller ne le supprime jamais.')),
  )
}

// ---------------------------------------------------------------- journal
function vueJournal() {
  return h('div', {}, h('h1', {}, 'Journal'),
    h('div', { class: 'journal' }, etat.journal.length ? etat.journal.slice().reverse().map((l) => h('div', { class: l.niveau === 'erreur' ? 'erreur' : '' }, `${l.t.slice(11, 19)}  ${l.message}${l.raison ? ' — ' + l.raison : ''}`)) : 'Rien pour l’instant.'))
}

// ---------------------------------------------------------------- cadre
function rendre() {
  const barre = document.getElementById('onglets')
  barre.replaceChildren(...ONGLETS.map(([id, titre]) => h('button', { class: id === onglet ? 'actif' : '', onclick: () => { if (onglet === 'sources' && id !== 'sources') { appel('navMasquer'); dernierPlace = null } onglet = id; messageFlash = ''; rendre() } }, titre)))
  document.getElementById('pied').textContent = etat ? `v${etat.version}` : ''
  const contenu = document.getElementById('contenu')
  if (!etat) { contenu.replaceChildren(h('p', {}, 'Chargement…')); return }
  const vues = { accueil: vueAccueil, rapports: vueRapports, sources: vueSources, reglages: vueReglages, journal: vueJournal }
  contenu.replaceChildren(vues[onglet]())
}

window.poste.sur('etat', (e) => {
  etat = e
  const a = document.activeElement
  if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) return // do not wipe what Max is typing
  rendre()
})
window.poste.sur('progression', (p) => { if (etat) { etat.nuit.progression = p; if (onglet === 'accueil') rendre() } })
window.poste.sur('nav', ({ url }) => { const c = document.getElementById('url-nav'); if (c) c.value = url })
;(async () => { etat = await appel('etat'); rendre() })()
