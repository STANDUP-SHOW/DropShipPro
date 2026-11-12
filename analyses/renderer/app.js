'use strict'
/* The screen. Data is only ever put in with textContent: nothing from a report or a site is parsed as HTML. */

// the menu (GROUPES_MENU) and the KANTIX screens live in kantix.js
let onglet = 'analyses'
let etat = null
let sourceChoisie = null
let messageFlash = ''
// rayon picked for the test: { categorie, theme } ids (null = first rayon of the day)
let choixTest = null

function h(tag, attrs, ...enfants) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue
    if (k === 'class') el.className = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'value') el.value = v
    else if (k === 'checked') el.checked = Boolean(v)
    // the page CSP refuses style attributes; CSSOM assignments are allowed
    else if (k === 'style') el.style.cssText = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const e of enfants.flat()) if (e !== null && e !== undefined && e !== false) el.append(e.nodeType ? e : document.createTextNode(String(e)))
  return el
}

/** Rayon and theme of the test, defaulting to the first category and its theme of the day. */
function choixDuTest(e) {
  const cat = (e.catalogue || []).find((c) => choixTest && c.id === choixTest.categorie) || (e.catalogue || [])[0]
  if (!cat) return null
  const theme = cat.themes.find((t) => choixTest && t.id === choixTest.theme) || cat.themes.find((t) => t.id === cat.themeDuJour) || cat.themes[0]
  return { categorie: cat.id, theme: theme.id }
}

function vueChoixTest(e) {
  const choix = choixDuTest(e)
  if (!choix) return null
  const cat = e.catalogue.find((c) => c.id === choix.categorie)
  return h('div', { class: 'ligne' },
    h('label', { class: 'doux petit' }, 'Rayon du test : '),
    h('select', { id: 'test-categorie', onchange: (ev) => { choixTest = { categorie: ev.target.value, theme: null }; rendre() } },
      e.catalogue.map((c) => h('option', { value: c.id, selected: c.id === choix.categorie }, c.nom))),
    h('select', { id: 'test-theme', onchange: (ev) => { choixTest = { categorie: choix.categorie, theme: ev.target.value }; rendre() } },
      cat.themes.map((t) => h('option', { value: t.id, selected: t.id === choix.theme }, t.id === cat.themeDuJour ? `${t.nom} (thème du jour)` : t.nom))),
  )
}

const pastille = (texte, type) => h('span', { class: `pastille ${type || ''}` }, texte)

async function appel(nom, arg) {
  const r = await window.poste[nom](arg)
  if (!r.ok) { flash(r.erreur); return null }
  return r.valeur
}

function flash(m) { messageFlash = m; rendre() }

// Rayons run by the night: ids = list of category ids, null = all of them.
async function choisirRayons(ids) {
  const x = await appel('rayonsNuit', { ids })
  if (x) { etat = x; rendre() }
}

// ---------------------------------------------------------------- tableau de bord
function vueAccueil() {
  const e = etat
  const cles = e.secrets
  const avecSerper = e.reglages.moteurRecherche === 'serper'
  const toutesCles = cles.anthropic && (!avecSerper || cles.serper)
  const prog = e.nuit.progression
  const b = e.nuit.dernierBilan
  const faits = e.rayonsDuJour.filter((r) => r.fait).length
  const choisis = e.rayonsDuJour.filter((r) => r.choisi).length
  const total = e.rayonsDuJour.length

  return h('div', {},
    h('h1', {}, 'Tableau de bord'),
    h('div', { class: 'grille' },
      h('div', { class: 'carte' },
        h('h2', {}, 'Prêt à travailler ?'),
        h('div', {}, 'Clé IA des rayons ', pastille(cles.anthropic ? (e.cleRayons ? `${e.cleRayons.nom} · ${e.cleRayons.fournisseur}` : 'posée') : 'absente', cles.anthropic ? 'bon' : 'mauvais')),
        avecSerper
          ? h('div', {}, 'Clé Serper ', pastille(cles.serper ? 'posée' : 'absente', cles.serper ? 'bon' : 'mauvais'))
          : h('div', {}, 'Recherche web ', pastille(`par ${e.cleRayons ? e.cleRayons.fournisseur : 'Claude'}, sans Serper`, e.cleRayons && !e.cleRayons.recherche ? 'mauvais' : 'bon')),
        h('div', {}, 'Clé d’administration du site ', pastille(e.admin.cle ? 'créée' : 'absente', e.admin.cle ? 'bon' : 'mauvais')),
        h('div', {}, 'Sources de données ', pastille(String(e.sources.length), e.sources.length ? 'bon' : '')),
        (!toutesCles || !e.admin.cle) && h('p', {}, h('button', { class: 'btn principal', onclick: () => aller('reglages') }, 'Poser mes clés')),
        (!toutesCles || !e.admin.cle) && h('p', { class: 'doux petit' }, avecSerper ? 'Les trois clés se posent dans Réglages : elles restent chiffrées sur ce PC.' : 'La clé IA des rayons (Connecteurs) et la clé d’administration (Réglages) restent chiffrées sur ce PC.'),
      ),
      h('div', { class: 'carte' },
        h('h2', {}, `Aujourd’hui (${e.date})`),
        h('div', {}, `${faits} / ${e.rayonsDuJour.length} rapports validés`),
        h('div', { class: 'barre-prog' }, h('div', { style: `width:${Math.round((faits / e.rayonsDuJour.length) * 100)}%` })),
        h('div', {}, `Envoyés au site : ${e.rapports.filter((x) => x.envoyeLe).length} / ${e.rapports.filter((x) => x.statut === 'ok').length} validés `, pastille(!e.envoi.actif ? 'coupé' : !e.envoi.cle ? 'clé absente' : e.envoi.enAttente ? `${e.envoi.enAttente} en attente` : 'à jour', e.envoi.actif && e.envoi.cle && !e.envoi.enAttente ? 'bon' : 'alerte')),
        h('div', {}, `Rayons de la nuit : ${choisis} sur ${total} `, pastille(choisis === total ? 'tous' : choisis ? 'sélection' : 'aucun', choisis === total ? '' : choisis ? 'alerte' : 'mauvais')),
        h('p', { class: 'doux petit' }, e.reglages.nuitActivee ? `Nuit automatique à ${e.reglages.heureNuit} : ACTIVÉE` : 'Nuit automatique : désactivée (rien ne tourne sans votre accord).'),
      ),
    ),
    h('div', { class: 'carte' },
      h('h2', {}, 'Actions'),
      h('div', { class: 'ligne' },
        h('button', { class: 'btn', onclick: async () => {
          flash('Contrôle en cours…')
          const r = await appel('credits')
          if (r) flash(`${e.cleRayons ? e.cleRayons.fournisseur : 'Anthropic'} : ${r.claude.ok ? 'OK' : r.claude.message}${r.serper.utilise ? ` — Serper : ${r.serper.ok ? 'OK' : r.serper.message}` : ' — recherche web sans Serper'}`)
        } }, avecSerper ? 'Contrôler les crédits (1 crédit Serper)' : 'Contrôler la clé des rayons'),
        h('button', { class: 'btn principal', disabled: e.nuit.enCours || !toutesCles, onclick: async () => { const r = await appel('rayonTest', choixDuTest(e)); if (r && !r.annule) flash(`Rayon test : ${r.statut}`) } }, 'Lancer UN rayon test'),
        h('button', { class: 'btn', disabled: e.nuit.enCours || !toutesCles || !choisis, onclick: async () => { const r = await appel('nuitLancer'); if (r && !r.annule) flash(r.annulee ? `Nuit annulée : ${r.annulee}` : 'Nuit terminée') } }, choisis === total ? 'Lancer la nuit complète' : `Lancer ${choisis} rayon${choisis > 1 ? 's' : ''} sur ${total}`),
        h('button', { class: 'btn danger', disabled: !e.nuit.enCours, onclick: () => appel('nuitArreter') }, 'Arrêter après le rayon en cours'),
      ),
      vueChoixTest(e),
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
      h('p', { class: 'doux petit' }, `À n’activer qu’après un rayon test dont vous avez validé la qualité (20 produits, 20 URL distinctes, marges en euros). Coût par rayon coché : ${e.reglages.coutParRayon}. Les rayons se choisissent dans « Rapports du jour ».`),
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
      h('h2', {}, 'Envoi au site drop-shipper.fr'),
      h('p', { class: 'doux petit' }, e.envoi.actif && e.envoi.cle
        ? 'Chaque rapport validé part seul sur le site, rayon et marketing d’un coup : le site range chacun à sa place (Analyses, Produits gagnants, Prompts, Fresh news). Un rapport « à revoir » ne part jamais.'
        : !e.envoi.actif ? 'L’envoi au site est coupé (Réglages). Les rapports restent sur ce PC.'
        : 'Il manque la clé d’administration du Poste (onglet Administration) : rien ne part tant qu’elle est absente.'),
      h('div', { class: 'ligne' },
        h('button', { class: 'btn principal', disabled: !e.envoi.actif || !e.envoi.cle || !e.envoi.enAttente, onclick: async () => {
          flash('Envoi en cours…')
          const r = await appel('envoyerAuSite')
          if (r) flash(r.raison || `${r.envoyes} rapport(s) envoyé(s) au site${r.echecs.length ? `, ${r.echecs.length} refusé(s) : ${r.echecs[0].message}` : ''}.`)
        } }, e.envoi.enAttente ? `Envoyer les ${e.envoi.enAttente} rapport(s) validé(s) en attente` : 'Rien en attente'),
        h('span', { class: 'doux petit' }, `Adresse : ${e.envoi.apiBase}`),
      ),
    ),
    h('div', { class: 'carte' },
      h('h2', {}, 'Rayons de la nuit'),
      h('p', { class: 'doux petit' }, 'Cochez les rayons que la nuit doit analyser (par exemple deux seulement pour tester). Sans choix, les 24 sont lancés. Un rayon déjà validé aujourd’hui est sauté.'),
      h('div', { class: 'ligne' },
        h('button', { class: 'btn', onclick: () => choisirRayons(null) }, 'Tout cocher'),
        h('button', { class: 'btn', onclick: () => choisirRayons([]) }, 'Tout décocher'),
        h('button', { class: 'btn', onclick: () => choisirRayons(e.rayonsDuJour.filter((r) => !r.fait).map((r) => r.categorie)) }, 'Cocher ceux pas encore validés'),
        h('span', { class: 'doux petit' }, `${e.rayonsDuJour.filter((r) => r.choisi).length} coché(s) sur ${e.rayonsDuJour.length}`),
      ),
    ),
    h('div', { class: 'carte' },
      h('table', {},
        h('thead', {}, h('tr', {}, ['Nuit', 'Catégorie', 'Thème du jour', 'État', 'Site', 'Produits', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, e.rayonsDuJour.map((r) => {
          const rap = e.rapports.find((x) => x.categorie === r.categorie && x.theme === r.theme)
          return h('tr', {},
            h('td', {}, h('input', { type: 'checkbox', checked: r.choisi, title: 'Inclure ce rayon dans la nuit', onchange: (ev) => {
              const ids = e.rayonsDuJour.filter((x) => (x.categorie === r.categorie ? ev.target.checked : x.choisi)).map((x) => x.categorie)
              choisirRayons(ids)
            } })),
            h('td', {}, r.libelleCategorie),
            h('td', {}, r.libelleTheme),
            h('td', {}, rap ? pastille(rap.statut === 'ok' ? 'validé' : 'à revoir', rap.statut === 'ok' ? 'bon' : 'alerte') : pastille('pas encore', ''), rap && rap.problemes.length ? h('div', { class: 'petit doux' }, rap.problemes.join(' · ')) : null),
            h('td', {}, !rap ? '—' : rap.statut !== 'ok' ? pastille('non envoyé', 'alerte') : rap.envoyeLe ? pastille('en ligne', 'bon') : pastille('pas envoyé', 'mauvais')),
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
let dernierPlace = null
function placerNavigateur(zone, choisie) {
  if (!choisie) { appel('navMasquer'); dernierPlace = null; return }
  const r = zone.getBoundingClientRect()
  const bounds = { x: r.left, y: r.top, width: r.width, height: r.height }
  if (dernierPlace !== choisie.id) { dernierPlace = choisie.id; window.poste.navAfficher({ id: choisie.id, bounds }) }
  else window.poste.navPlacer(bounds)
}
window.addEventListener('resize', () => { if (onglet === 'navigateur') rendre() })

// ---------------------------------------------------------------- administration du site
// What the site answers about its sellers lives here, in memory, and is never written to disk.
let donneesAdmin = null
const dateCourte = (iso) => (iso ? String(iso).slice(0, 10) : '—')

async function chargerAdmin() {
  flash('Lecture des utilisateurs sur le site…')
  const [u, n] = await Promise.all([appel('adminUtilisateurs'), appel('adminNewsletter')])
  if (u) { donneesAdmin = { ...u, newsletter: n || null }; flash('') }
}

function vueAdministration() {
  const a = etat.admin
  const d = donneesAdmin
  return h('div', {},
    h('h1', {}, 'Administration de drop-shipper.fr'),
    h('div', { class: 'carte' },
      h('h2', {}, 'Ce Poste est l’administrateur unique du site'),
      h('p', { class: 'doux petit' }, 'Il n’y a pas de compte administrateur sur le site : la seule porte est la clé fabriquée par ce Poste. Elle reste chiffrée par Windows sur ce PC, vous ne la voyez jamais ; le site ne retient que son empreinte.'),
      h('div', {}, 'Clé d’administration ', pastille(a.cle ? 'créée' : 'absente', a.cle ? 'bon' : 'mauvais')),
      a.cle && h('div', { class: 'petit' }, 'Empreinte à poser sur le site : ', h('code', {}, a.empreinte)),
      h('ol', { class: 'petit' },
        h('li', {}, a.cle ? 'Clé créée.' : 'Créez la clé (bouton ci-dessous).'),
        h('li', {}, 'Cliquez « Copier l’empreinte », ouvrez Railway › le service du site › Variables, créez POSTE_ADMIN_SHA256 et collez l’empreinte.'),
        h('li', {}, 'Attendez le redémarrage du site (quelques minutes), puis « Tester la connexion ».')),
      h('div', { class: 'ligne' },
        h('button', { class: 'btn principal', onclick: async () => { const x = await appel('adminCreer'); if (x) { etat = x; flash(x.admin.cle ? 'Clé créée. Copiez maintenant l’empreinte dans Railway.' : '') } } }, a.cle ? 'Remplacer la clé' : 'Créer la clé d’administration'),
        h('button', { class: 'btn', disabled: !a.cle, onclick: async () => { const r = await appel('adminCopier'); if (r) flash('Empreinte copiée : collez-la dans la variable Railway POSTE_ADMIN_SHA256.') } }, 'Copier l’empreinte'),
        h('button', { class: 'btn', disabled: !a.cle, onclick: async () => { flash('Test en cours…'); const r = await appel('adminTester'); if (r) flash(r.ok ? 'Connecté : le site reconnaît ce Poste comme administrateur.' : 'Réponse inattendue du site.') } }, 'Tester la connexion'),
        a.cle && h('button', { class: 'btn danger', onclick: async () => { if (confirm('Effacer la clé ? L’envoi des rapports et l’administration seront coupés.')) { const x = await appel('secret', { nom: 'admin', valeur: '' }); if (x) { etat = x; donneesAdmin = null; rendre() } } } }, 'Effacer'),
      ),
      messageFlash && h('p', { class: 'petit' }, messageFlash),
    ),
    h('div', { class: 'carte' },
      h('h2', {}, 'Utilisateurs inscrits'),
      h('div', { class: 'ligne' },
        h('button', { class: 'btn', disabled: !a.cle, onclick: chargerAdmin }, d ? 'Actualiser' : 'Afficher les utilisateurs'),
        d && h('button', { class: 'btn principal', disabled: !selection.size, onclick: () => { nl.cible = 'selection'; aller('newsletter') } }, `Envoyer la newsletter aux ${selection.size} sélectionné(s)`),
        d && selection.size > 0 && h('button', { class: 'btn', onclick: () => { selection.clear(); rendre() } }, 'Désélectionner')),
      d && h('div', {},
        h('p', {}, `${d.total} compte(s), dont ${d.verifies} adresse(s) confirmée(s) ; ${d.abonnesNewsletter} abonné(s) à la newsletter.`, d.total > d.utilisateurs.length ? ` Les ${d.utilisateurs.length} plus récents sont listés.` : ''),
        h('table', {},
          h('thead', {}, h('tr', {},
            h('th', {}, h('input', { type: 'checkbox', title: 'Tout sélectionner', checked: d.utilisateurs.length > 0 && d.utilisateurs.every((u) => selection.has(u.id)), onchange: (ev) => { d.utilisateurs.forEach((u) => (ev.target.checked ? selection.add(u.id) : selection.delete(u.id))); rendre() } })),
            ['Inscrit le', 'E-mail', 'Boutique', 'Offre', 'Drops', 'Adresse', 'Newsletter', ''].map((t) => h('th', {}, t)))),
          h('tbody', {}, d.utilisateurs.map((u) => h('tr', {},
            h('td', {}, h('input', { type: 'checkbox', checked: selection.has(u.id), onchange: (ev) => { ev.target.checked ? selection.add(u.id) : selection.delete(u.id); rendre() } })),
            h('td', {}, dateCourte(u.createdAt)), h('td', {}, u.email), h('td', {}, u.shopName || '—'), h('td', {}, String(u.plan || '—')), h('td', {}, String(u.credits)),
            h('td', {}, u.emailVerifiedAt ? pastille('confirmée', 'bon') : pastille('non confirmée', '')),
            h('td', {}, u.desinscrit ? pastille('désinscrit', 'mauvais') : u.newsletter ? pastille('abonné', 'bon') : '—'),
            h('td', { class: 'actions-ligne' },
              h('button', { class: 'icone', title: `Écrire à ${u.email}`, onclick: () => { ecrireA = u; brouillon = { sujet: '', message: '', repondreA: brouillon.repondreA }; rendre() } }, '✉'),
              h('button', { class: 'icone danger', title: `Supprimer ${u.email}`, onclick: () => supprimerUtilisateur(u) }, '✕')))))),
      ),
      ecrireA && h('div', { class: 'carte' },
        h('h2', {}, `Écrire à ${ecrireA.email}`),
        h('label', {}, 'Objet'), h('input', { value: brouillon.sujet, oninput: (ev) => { brouillon.sujet = ev.target.value } }),
        h('label', {}, 'Message (mis en page aux couleurs de DropShipper)'), h('textarea', { rows: 8, oninput: (ev) => { brouillon.message = ev.target.value } }, brouillon.message),
        h('label', {}, 'Adresse de réponse (facultatif : là où arrivera sa réponse)'), h('input', { value: brouillon.repondreA, placeholder: 'contact@…', oninput: (ev) => { brouillon.repondreA = ev.target.value } }),
        h('div', { class: 'ligne', style: 'margin-top:10px' },
          h('button', { class: 'btn principal', onclick: envoyerMessage }, 'Envoyer'),
          h('button', { class: 'btn', onclick: () => { ecrireA = null; rendre() } }, 'Annuler'))),
      d && d.newsletter && h('div', {},
        h('h2', {}, `Abonnés à la newsletter (${d.newsletter.total})`),
        h('table', {}, h('tbody', {}, d.newsletter.subscribers.slice(0, 200).map((s) => h('tr', {}, h('td', {}, dateCourte(s.createdAt)), h('td', {}, s.email), h('td', {}, s.source || '—'))))),
      ),
      h('p', { class: 'doux petit' }, 'Ces données personnelles restent à l’écran, elles ne sont écrites nulle part sur ce PC. ✉ écrit à un utilisateur, ✕ supprime son compte (avec accord), les cases servent à envoyer la newsletter à une sélection (onglet Newsletter).'),
    ),
  )
}

// ---- users: selection, message, deletion (12/11/2026)
const selection = new Set()
let ecrireA = null
let brouillon = { sujet: '', message: '', repondreA: '' }

async function supprimerUtilisateur(u) {
  const r = await appel('adminUtilisateurSupprimer', { id: u.id, email: u.email })
  if (!r || r.annule) return
  selection.delete(u.id)
  if (ecrireA && ecrireA.id === u.id) ecrireA = null
  donneesAdmin.utilisateurs = donneesAdmin.utilisateurs.filter((x) => x.id !== u.id)
  donneesAdmin.total -= 1
  flash(`Compte ${u.email} supprimé du site.`)
}

async function envoyerMessage() {
  if (!brouillon.sujet.trim() || !brouillon.message.trim()) return flash('Il faut un objet et un message.')
  flash('Envoi du message…')
  const r = await appel('adminUtilisateurEcrire', { id: ecrireA.id, ...brouillon })
  if (r) { ecrireA = null; brouillon = { sujet: '', message: '', repondreA: brouillon.repondreA }; flash(`Message envoyé à ${r.email}.`) }
}

// ---------------------------------------------------------------- newsletter (12/11/2026)
// The imported HTML stays in memory; nothing about the recipients is written on this PC.
let nl = { nom: '', html: '', sujet: '', avertissements: [], essai: '', cible: 'abonnes', bilan: null, essaiFait: '' }
// The real send stays locked until a test of THIS file with THIS subject reached someone (Kantix thread, 12/11/2026).
const empreinteNl = () => `${nl.nom}|${nl.sujet.trim()}|${nl.html.length}|${nl.html.slice(0, 200)}|${nl.html.slice(-200)}`

async function importerNewsletter() {
  const r = await appel('newsletterImporter')
  if (!r) return
  nl = { ...nl, nom: r.nom, html: r.html, sujet: nl.sujet || r.titre, avertissements: r.avertissements, bilan: null }
  flash(`« ${r.nom} » importé (${Math.round(r.taille / 1024)} Ko).`)
}

async function envoyerNewsletter(essai) {
  if (!nl.sujet.trim()) return flash('Il faut un objet.')
  if (!essai && nl.essaiFait !== empreinteNl()) return flash('Envoyez d’abord un essai de ce fichier avec cet objet.')
  if (essai && !nl.essai.trim()) return flash('Indiquez l’adresse qui reçoit l’essai.')
  const nombre = nl.cible === 'abonnes' ? (donneesAdmin && donneesAdmin.newsletter ? donneesAdmin.newsletter.total : null) : selection.size
  flash(essai ? 'Envoi de l’essai…' : 'Envoi de la newsletter… (100 adresses par lot, ne fermez pas Kantix)')
  const r = await appel('newsletterEnvoyer', { sujet: nl.sujet.trim(), html: nl.html, cible: nl.cible, ids: [...selection], essai: essai ? nl.essai.trim() : '', nombre })
  if (!r || r.annule) { if (r) flash(''); return }
  nl.bilan = { ...r, essai }
  if (essai && r.envoyes) nl.essaiFait = empreinteNl()
  flash(essai ? (r.envoyes ? `Essai envoyé à ${nl.essai}.` : 'L’essai n’est pas parti.') : `${r.envoyes} envoyée(s) sur ${r.destinataires}.`)
}

function vueNewsletter() {
  const a = etat.admin
  const d = donneesAdmin
  const abonnes = d && d.newsletter ? d.newsletter.total : null
  const pret = a.cle && nl.html && nl.sujet.trim()
  const essaiValide = pret && nl.essaiFait === empreinteNl()
  return h('div', {},
    h('h1', {}, 'Newsletter de drop-shipper.fr'),
    !a.cle && h('p', { class: 'bandeau-alerte' }, 'Créez d’abord la clé d’administration (onglet Administration).'),
    h('div', { class: 'carte' },
      h('h2', {}, '1. Le fichier'),
      h('p', { class: 'doux petit' }, 'Importez la newsletter déjà mise en page (fichier .html, images hébergées en https). Écrivez {{desinscription}} là où doit aller le lien de désinscription ; sans cette marque, le site ajoute le lien en bas de chaque e-mail.'),
      h('div', { class: 'ligne' },
        h('button', { class: 'btn', onclick: importerNewsletter }, nl.html ? 'Importer un autre fichier' : 'Importer le fichier HTML'),
        nl.html && h('span', {}, nl.nom),
        nl.html && h('button', { class: 'btn', onclick: () => appel('newsletterApercu', { html: nl.html }) }, 'Aperçu')),
      nl.avertissements.length > 0 && h('ul', { class: 'petit' }, nl.avertissements.map((t) => h('li', {}, t))),
      h('label', {}, 'Objet de l’e-mail'),
      h('input', { value: nl.sujet, placeholder: 'Les nouveautés DropShipper de novembre', oninput: (ev) => { nl.sujet = ev.target.value; const b = document.getElementById('envoi-nl'); if (b) b.disabled = true } }),
    ),
    h('div', { class: 'carte' },
      h('h2', {}, '2. Un essai d’abord'),
      h('div', { class: 'ligne' },
        h('input', { value: nl.essai, placeholder: 'votre adresse', style: 'max-width:320px', oninput: (ev) => { nl.essai = ev.target.value } }),
        h('button', { class: 'btn', disabled: !pret, onclick: () => envoyerNewsletter(true) }, 'Envoyer un essai')),
    ),
    h('div', { class: 'carte' },
      h('h2', {}, '3. Les destinataires'),
      !d && h('p', { class: 'doux petit' }, 'Cliquez « Afficher les utilisateurs » dans l’onglet Administration pour voir les nombres et sélectionner des comptes.'),
      h('label', { class: 'case' }, h('input', { type: 'radio', name: 'cible', checked: nl.cible === 'abonnes', onchange: () => { nl.cible = 'abonnes'; rendre() } }), ` Tous les abonnés à la newsletter${abonnes !== null ? ` (${abonnes})` : ''}`),
      h('label', { class: 'case' }, h('input', { type: 'radio', name: 'cible', checked: nl.cible === 'selection', onchange: () => { nl.cible = 'selection'; rendre() } }), ` Les utilisateurs sélectionnés (${selection.size})`),
      h('p', { class: 'doux petit' }, 'Les adresses qui se sont désinscrites sont toujours écartées par le site, quelle que soit la liste.'),
      h('div', { class: 'ligne' },
        h('button', { id: 'envoi-nl', class: 'btn principal', disabled: !essaiValide || (nl.cible === 'selection' && !selection.size), onclick: () => envoyerNewsletter(false) }, 'Envoyer la newsletter'),
        pret && !essaiValide && h('span', { class: 'doux petit' }, 'Envoyez d’abord un essai de ce fichier avec cet objet.')),
    ),
    messageFlash && h('p', { class: 'petit' }, messageFlash),
    nl.bilan && h('div', { class: 'carte' },
      h('h2', {}, nl.bilan.essai ? 'Résultat de l’essai' : 'Résultat de l’envoi'),
      h('p', {}, `${nl.bilan.envoyes} envoyée(s) sur ${nl.bilan.destinataires}`, nl.bilan.desinscritsEcartes ? ` ; ${nl.bilan.desinscritsEcartes} adresse(s) désinscrite(s) écartée(s)` : '', nl.bilan.nbEchecs ? ` ; ${nl.bilan.nbEchecs} échec(s).` : '.'),
      nl.bilan.echecs.length > 0 && h('ul', { class: 'petit erreur' }, nl.bilan.echecs.slice(0, 20).map((x) => h('li', {}, `${x.email} : ${x.raison}`)))),
  )
}

// ---------------------------------------------------------------- shared bits
function aller(id) {
  if (onglet === 'navigateur' && id !== 'navigateur') { appel('navMasquer'); dernierPlace = null }
  onglet = id; messageFlash = ''; rendre()
}

// The site admin key: made by the Poste (never typed), its fingerprint goes in Railway once.
function blocCleAdmin() {
  const a = etat.admin
  return h('div', {},
    h('label', {}, 'Clé d’administration du site (Import Drive, Affiliation, Utilisateurs, envoi des rapports) ', pastille(a.cle ? 'créée' : 'absente', a.cle ? 'bon' : 'mauvais')),
    h('p', { class: 'doux petit' }, a.cle
      ? 'Le Poste l’a fabriquée et la garde chiffrée. Le site la reconnaît quand son empreinte est posée dans la variable Railway POSTE_ADMIN_SHA256.'
      : 'Elle ne se tape pas : le Poste la fabrique. Ensuite, son empreinte se colle une fois dans la variable Railway POSTE_ADMIN_SHA256.'),
    a.cle && h('div', { class: 'petit' }, 'Empreinte : ', h('code', {}, a.empreinte)),
    h('div', { class: 'ligne' },
      !a.cle && h('button', { class: 'btn principal', onclick: async () => { const x = await appel('adminCreer'); if (x) { etat = x; flash('Clé créée. Copiez maintenant l’empreinte dans Railway.') } } }, 'Créer la clé d’administration'),
      a.cle && h('button', { class: 'btn', onclick: async () => { if (await appel('adminCopier')) flash('Empreinte copiée : collez-la dans la variable Railway POSTE_ADMIN_SHA256.') } }, 'Copier l’empreinte'),
      a.cle && h('button', { class: 'btn', onclick: async () => { flash('Test en cours…'); const r = await appel('adminTester'); if (r) flash(r.ok ? 'Connecté : le site reconnaît ce Poste comme administrateur.' : 'Réponse inattendue du site.') } }, 'Tester la connexion'),
    ),
  )
}

// Admin tabs need the key: say so instead of showing an empty screen.
function sansCleAdmin(titre) {
  return h('div', {}, h('h1', {}, titre),
    h('div', { class: 'carte' },
      h('p', {}, 'Cet écran parle au site avec la clé d’administration du Poste, qui n’est pas encore créée.'),
      h('button', { class: 'btn principal', onclick: () => aller('reglages') }, 'Créer la clé dans Réglages')))
}

// ---------------------------------------------------------------- import Google Drive
// Several public folders, kept on this computer: pasting a link adds one. Each is read
// with all its sub-folders by the site; the folder pasted can be a parent, a date or a category.
const ADRESSE_DRIVE = 'https://drive.google.com/drive/folders/17mUuLYxUAzt9PFBNv_SCBdzHlCyEQM1k'
const CLE_DOSSIERS_DRIVE = 'kantix.dossiersDrive'
const drive = { dossiers: lireDossiersDrive(), ajout: '', listes: {}, choisies: {}, rapports: [], enCours: null }
const ATTENDU_DRIVE = 'Pour être importé, un rayon doit avoir un fichier <thème>.rayon.md (le tableau des produits), avec ou sans <thème>.marketing.md, ou un .json aiMARKET qui porte un bloc « study ». Sa date vient du dossier AAAA-MM-JJ qui le contient, sinon de son en-tête (date, categorie). Un .marketing.md seul, un .json sans « study » ou une note de sourcing ne s’importent pas.'
/** Why a study found in the folder cannot be imported, before anything is sent. */
function motifNonImportable(x) {
  if (x.importable) return null
  return x.fichiers.some((f) => /\.marketing\.md$/i.test(f)) ? 'marketing seul, sans .rayon.md' : 'aucun .rayon.md ni .json importable'
}
const STATUT_DRIVE = { importe: ['importée', 'bon'], apercu: ['à importer', ''], doublon: ['doublon ignoré', ''], refuse: ['refusée', 'mauvais'] }

/** The folder id of a Drive link (same patterns as the site), or null. */
function idDrive(adresse) {
  const a = String(adresse || '').trim()
  const m = a.match(/\/folders\/([A-Za-z0-9_-]{10,})/) || a.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || a.match(/^([A-Za-z0-9_-]{10,})$/)
  return m ? m[1] : null
}
function lireDossiersDrive() {
  try {
    const l = JSON.parse(localStorage.getItem(CLE_DOSSIERS_DRIVE) || 'null')
    if (Array.isArray(l) && l.length) return l.filter((a) => typeof a === 'string' && idDrive(a))
  } catch { /* no saved list: the default folder */ }
  return [ADRESSE_DRIVE]
}
function garderDossiersDrive() {
  try { localStorage.setItem(CLE_DOSSIERS_DRIVE, JSON.stringify(drive.dossiers)) } catch { /* kept for this session only */ }
}

async function driveListerUn(adresse) {
  const l = await appel('adminDriveLister', { adresse })
  if (!l) return false
  drive.listes[adresse] = l
  // Preselect the dates that hold something new.
  drive.choisies[adresse] = new Set(l.dates.filter((d) => d.etudes.some((x) => x.importable && !x.dejaEnBase)).map((d) => d.date))
  return true
}

async function driveLister(adresses = drive.dossiers) {
  drive.enCours = 'liste'; drive.rapports = []
  let erreurs = 0
  for (const [i, a] of adresses.entries()) {
    flash(`Lecture du dossier ${i + 1} sur ${adresses.length} sur Google Drive (par le site)…`)
    if (!(await driveListerUn(a))) erreurs++
  }
  drive.enCours = null
  if (!erreurs) flash('')
}

async function driveAjouter() {
  // Several links pasted at once (one per line, or separated by spaces) are all added.
  const liens = drive.ajout.split(/[\s,;]+/).filter(Boolean)
  const connus = new Set(drive.dossiers.map(idDrive))
  const nouveaux = []
  for (const l of liens) {
    const id = idDrive(l)
    if (!id) { flash(`Lien non reconnu : ${l} (attendu : https://drive.google.com/drive/folders/…)`); return }
    if (!connus.has(id)) { connus.add(id); nouveaux.push(l.trim()) }
  }
  drive.ajout = ''
  if (!nouveaux.length) { flash('Ce dossier est déjà dans la liste.'); return }
  drive.dossiers.push(...nouveaux)
  garderDossiersDrive()
  await driveLister(nouveaux)
}

function driveRetirer(adresse) {
  drive.dossiers = drive.dossiers.filter((a) => a !== adresse)
  delete drive.listes[adresse]; delete drive.choisies[adresse]
  garderDossiersDrive()
  rendre()
}

const datesChoisies = () => drive.dossiers.reduce((n, a) => n + (drive.choisies[a]?.size || 0), 0)

async function driveImporter(essai) {
  const cibles = drive.dossiers.filter((a) => drive.choisies[a]?.size)
  drive.enCours = essai ? 'apercu' : 'import'; drive.rapports = []
  for (const [i, adresse] of cibles.entries()) {
    flash(`${essai ? 'Vérification de la qualité' : 'Import'} : dossier ${i + 1} sur ${cibles.length}…`)
    const r = await appel('adminDriveImporter', { adresse, dates: [...drive.choisies[adresse]], essai })
    if (!r) { drive.enCours = null; return }
    drive.rapports.push({ adresse, ...r })
    if (!essai) await driveListerUn(adresse)
  }
  drive.enCours = null
  flash('')
}

/** One folder's dates, as the site found them. */
function vueDossierDrive(adresse) {
  const l = drive.listes[adresse]
  const choisies = drive.choisies[adresse] || new Set()
  return h('div', { class: 'carte' },
    h('div', { class: 'ligne' },
      h('div', { style: 'flex:1;min-width:260px;word-break:break-all' }, h('strong', {}, adresse)),
      h('button', { class: 'btn', disabled: Boolean(drive.enCours), onclick: () => driveLister([adresse]).then(rendre) }, 'Relire'),
      h('button', { class: 'btn', disabled: Boolean(drive.enCours), onclick: () => driveRetirer(adresse) }, 'Retirer'),
    ),
    !l ? h('p', { class: 'doux petit' }, 'Pas encore lu.') : h('div', {},
      l.dates.length === 0 && h('p', { class: 'doux' }, 'Aucun rapport daté dans ce dossier ni dans ses sous-dossiers.'),
      l.dates.map((d) => {
        const importables = d.etudes.filter((x) => x.importable)
        const nouvelles = importables.filter((x) => !x.dejaEnBase)
        return h('div', { class: 'date-drive' },
          h('label', {}, h('span', {}, h('input', { type: 'checkbox', checked: choisies.has(d.date), onchange: (ev) => { if (ev.target.checked) choisies.add(d.date); else choisies.delete(d.date); drive.choisies[adresse] = choisies; rendre() } }),
            ' ', h('strong', {}, d.date), h('span', { class: 'doux petit' }, `  ${importables.length} rayon(s) · ${nouvelles.length} nouveau(x) · ${d.ignores.length} document(s) non importable(s)`))),
          h('div', { class: 'ligne' }, d.etudes.map((x) => pastille(`${x.categorie} / ${x.theme}${x.dejaEnBase ? ' (déjà là)' : ''}${x.doublons.length ? ' ×2' : ''}`, !x.importable ? 'mauvais' : x.dejaEnBase ? '' : 'alerte'))),
          ...d.etudes.filter((x) => !x.importable).map((x) => h('div', { class: 'petit erreur' }, `Non importable : ${x.categorie} / ${x.theme} (${x.fichiers.join(', ') || 'aucun fichier'}) — ${motifNonImportable(x)}`)),
          ...d.ignores.slice(0, 20).map((g) => h('div', { class: 'petit doux' }, `Ignoré : ${g.nom} — ${g.raison}`)),
        )
      }),
      (l.sansDate || []).length ? h('p', { class: 'petit erreur' }, `${l.sansDate.length} rapport(s) sans date (ni dossier AAAA-MM-JJ au-dessus, ni date dans le fichier) : `, l.sansDate.slice(0, 10).join(' ; '), '. Collez plutôt le dossier qui contient leur dossier daté.') : null,
    ),
  )
}

function vueRapportDrive(r) {
  return h('div', { class: 'carte' },
    h('p', { class: 'doux petit', style: 'word-break:break-all' }, r.adresse),
    h('h2', {}, r.essai
      ? `Aperçu : ${r.aImporter} rayon(s) à importer, ${r.doublons} doublon(s), ${r.refusees} refusé(s)`
      : `${r.importees} rayon(s) importé(s), ${r.doublons} doublon(s) ignoré(s), ${r.refusees} refusé(s)`),
    r.refusees > 0 && h('div', { class: 'erreur' },
      h('p', {}, `${r.refusees} rayon(s) refusé(s) par le site, rien n’a été écrit pour eux :`),
      r.lignes.filter((x) => x.statut === 'refuse').map((x) => h('div', { class: 'petit' }, `${x.date} · ${x.rayon} — ${x.raison || 'motif non donné par le site'}`)),
      h('p', { class: 'petit' }, ATTENDU_DRIVE),
    ),
    !r.essai && r.importees === 0 && r.refusees === 0 && !r.lignes.length && h('p', { class: 'erreur' }, `Aucun rayon importable dans les dates choisies. ${ATTENDU_DRIVE}`),
    h('p', { class: 'doux petit' }, `Contrat (20 produits, 20 adresses, prix sur 18) : ${r.conformes} conforme(s) sur ${r.lignes.filter((x) => x.statut === 'importe' || x.statut === 'apercu').length}${r.rapportsEnBase != null ? ` · ${r.rapportsEnBase} rapports en ligne` : ''}`),
    h('table', {},
      h('thead', {}, h('tr', {}, ['Date', 'Rayon', 'Statut', 'Produits', 'Adresses', 'Avec prix', 'Marketing'].map((t) => h('th', {}, t)))),
      h('tbody', {}, r.lignes.map((x) => h('tr', {},
        h('td', {}, x.date), h('td', {}, x.rayon),
        h('td', {}, pastille(...(STATUT_DRIVE[x.statut] || [x.statut, ''])), x.raison ? h('div', { class: 'petit doux' }, x.raison) : null),
        h('td', {}, x.produits == null ? '—' : String(x.produits)), h('td', {}, x.urlsDistinctes == null ? '—' : String(x.urlsDistinctes)),
        h('td', {}, x.avecPrix == null ? '—' : String(x.avecPrix)), h('td', {}, x.marketing == null ? '—' : x.marketing ? 'oui' : 'non'))))),
    r.ignores.length ? h('p', { class: 'doux petit' }, `${r.ignores.length} fichier(s) non importé(s) : `, r.ignores.slice(0, 20).map((g) => `${g.date} · ${g.nom} (${g.raison})`).join(' ; ')) : null,
  )
}

function vueDrive() {
  if (!etat.admin.cle) return sansCleAdmin('Importer des analyses depuis Google Drive')
  const champ = h('input', {
    value: drive.ajout, placeholder: 'Collez le lien du dossier Google Drive dont vous souhaitez importer les analyses',
    oninput: (ev) => { drive.ajout = ev.target.value },
    onkeydown: (ev) => { if (ev.key === 'Enter' && !drive.enCours) driveAjouter() },
    // A pasted link is added at once.
    onpaste: () => setTimeout(() => { if (!drive.enCours && idDrive(drive.ajout.split(/\s+/)[0])) driveAjouter() }, 0),
  })
  const n = datesChoisies()
  return h('div', {},
    h('h1', {}, 'Importer des analyses depuis Google Drive'),
    h('p', { class: 'doux petit' }, 'Analyses faites par d’autres agents, dans des dossiers Google Drive publics (« Tous les utilisateurs disposant du lien »). Chaque dossier est lu avec tous ses sous-dossiers : collez un dossier parent, un dossier daté (AAAA-MM-JJ) ou un dossier de catégorie. Le site les range dans la même base que les nôtres : les pages publiques n’en montrent ni fournisseur ni prix d’achat. Un rayon que nous avons déjà pour le même jour garde notre analyse.'),
    h('div', { class: 'carte' },
      h('label', {}, 'Ajouter un dossier Google Drive'),
      h('div', { class: 'ligne' },
        h('div', { style: 'flex:1;min-width:260px' }, champ),
        h('button', { class: 'btn principal', disabled: Boolean(drive.enCours), onclick: driveAjouter }, 'Ajouter'),
        h('button', { class: 'btn', disabled: Boolean(drive.enCours) || !drive.dossiers.length, onclick: () => driveLister() }, drive.enCours === 'liste' ? 'Lecture…' : `Lire les ${drive.dossiers.length} dossier(s)`),
      ),
      messageFlash && h('p', { class: 'petit' }, messageFlash),
    ),
    ...drive.dossiers.map(vueDossierDrive),
    drive.dossiers.length > 0 && h('div', { class: 'ligne' },
      h('button', { class: 'btn', disabled: !n || Boolean(drive.enCours), onclick: () => driveImporter(true) }, drive.enCours === 'apercu' ? 'Vérification…' : 'Vérifier la qualité'),
      h('button', { class: 'btn principal', disabled: !n || Boolean(drive.enCours), onclick: () => driveImporter(false) }, drive.enCours === 'import' ? 'Import en cours…' : `Importer ${n} date(s)`),
    ),
    ...drive.rapports.map(vueRapportDrive),
  )
}

// ---------------------------------------------------------------- Synthèses AIMARKET (08/11/2026)
// Max's decision: the daily syntheses are no longer published on the site. They are read here only, and the
// winners he picks are imported onto the seller account of his choice, as drafts.
const SECTIONS_SYNTHESE = [
  ['tous', 'Tous les produits'], ['top5', 'Top 5 du jour'], ['heros', 'Produits héros'], ['buyNow', 'Buy now'],
  ['roi', 'Champions ROI'], ['highTicket', 'High ticket'], ['breakout', 'Breakout (tendances)'], ['listeNoire', 'Liste noire (à ne pas acheter)'],
]
const synth = { jours: null, imports: [], date: null, detail: null, section: 'top5', choisis: {}, email: '', comptes: null, compte: null, bilan: null, enCours: null }

async function synthCharger() {
  synth.enCours = 'liste'; rendre()
  const r = await appel('adminSyntheses')
  synth.enCours = null
  synth.jours = r ? r.dates || [] : []
  synth.imports = r ? r.imports || [] : []
  if (!synth.date && synth.jours[0]) return synthOuvrir(synth.jours[0])
  rendre()
}

async function synthOuvrir(date) {
  synth.date = date; synth.detail = null; synth.choisis = {}; synth.bilan = null; synth.enCours = 'jour'; rendre()
  const d = await appel('adminSynthese', { date })
  synth.enCours = null
  if (d) {
    synth.detail = d
    if (!(d.sections[synth.section] || []).length && synth.section !== 'tous') synth.section = 'tous'
  }
  rendre()
}

async function synthComptes() {
  synth.enCours = 'comptes'; rendre()
  const u = await appel('adminUtilisateurs')
  synth.enCours = null
  synth.comptes = u ? u.utilisateurs || [] : null
  rendre()
}

function produitsSection() {
  const d = synth.detail
  if (!d) return []
  return synth.section === 'tous' ? d.produits : d.sections[synth.section] || []
}

// The account that receives the winners: checked on the site before anything is imported
async function synthVerifierCompte() {
  synth.enCours = 'compte'; synth.compte = null; rendre()
  const c = await appel('adminSyntheseCompte', { email: synth.email.trim().toLowerCase() })
  synth.enCours = null
  if (c) synth.compte = c
  rendre()
}

async function synthGoogle() {
  synth.enCours = 'google'; synth.compte = null; synth.bilan = null
  flash('Connexion dans votre navigateur : connectez-vous au compte DropShipper (Google ou mot de passe), puis revenez ici.')
  const r = await appel('compteConnecter')
  synth.enCours = null
  if (r) { synth.email = r.email; flash(''); return synthVerifierCompte() }
  rendre()
}

const idsChoisis = () => Object.keys(synth.choisis).filter((id) => synth.choisis[id])

async function synthImporter(essai) {
  const ids = idsChoisis()
  if (!essai && !confirm(`Importer ${ids.length} produit(s) en brouillon sur le compte ${synth.email.trim()} ?`)) return
  synth.enCours = essai ? 'essai' : 'import'; synth.bilan = null; rendre()
  const b = await appel('adminSyntheseImporter', { date: synth.date, email: synth.email.trim().toLowerCase(), ids, essai })
  synth.enCours = null
  if (b) synth.bilan = { ...b, essai: b.essai === true, nombre: b.essai === true ? b.aImporter : b.importes }
  rendre()
}

const euro = (n) => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`)

function vueSyntheses() {
  if (!etat.admin.cle) return sansCleAdmin('Synthèses AIMARKET')
  if (synth.jours === null && !synth.enCours) setTimeout(synthCharger, 0)
  const d = synth.detail
  const liste = produitsSection()
  const listeNoire = new Set(d ? (d.sections.listeNoire || []).map((p) => p.id) : [])
  const n = idsChoisis().length
  const adresseOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(synth.email.trim())
  const compte = synth.compte && synth.compte.compte.email === synth.email.trim().toLowerCase() ? synth.compte : null
  const refus = synth.imports.filter((i) => i.statut === 'refuse').slice(0, 5)
  return h('div', {},
    h('h1', {}, 'Synthèses AIMARKET'),
    h('p', { class: 'doux petit' }, 'Les synthèses du jour ne sont pas publiées sur le site : elles se lisent ici seulement. Cochez les produits gagnants passés au crible, choisissez le compte DropShipper qui les reçoit, puis importez. Chaque produit devient une annonce en brouillon sur ce compte, sans photo, gratuitement. Les liens de la synthèse sont des pages de recherche, pas des fiches produit. Un produit déjà sur ce compte n’est pas recréé.'),
    messageFlash && h('p', { class: 'petit' }, messageFlash),
    h('div', { class: 'carte' },
      h('div', { class: 'ligne' },
        h('strong', {}, 'Jours disponibles'),
        h('button', { class: 'btn', disabled: Boolean(synth.enCours), onclick: synthCharger }, synth.enCours === 'liste' ? 'Lecture…' : 'Actualiser')),
      synth.jours && !synth.jours.length && h('p', { class: 'doux petit' }, 'Aucune synthèse importée sur le site pour l’instant.'),
      synth.jours && synth.jours.length > 0 && h('div', { class: 'ligne' }, ...synth.jours.slice(0, 14).map((j) => h('button', {
        class: j === synth.date ? 'btn principal' : 'btn', disabled: Boolean(synth.enCours), onclick: () => synthOuvrir(j),
      }, j))),
      refus.length > 0 && h('details', {}, h('summary', { class: 'petit' }, `${refus.length} import(s) refusé(s) récemment`),
        h('ul', { class: 'petit' }, ...refus.map((i) => h('li', {}, `${i.date} (${String(i.quand || '').slice(0, 16).replace('T', ' ')}) : ${i.raison}`))))),
    synth.enCours === 'jour' && h('p', { class: 'doux' }, 'Lecture de la synthèse…'),
    d && h('div', { class: 'carte' },
      h('div', { class: 'ligne' },
        h('strong', {}, `Synthèse du ${d.date}`),
        h('span', { class: 'doux petit' }, `${d.compteurs.produitsAnalyses} produits · ${d.compteurs.opportunites} opportunités · ${d.compteurs.rayons} rayons · ${d.compteurs.aRisque} à risque`)),
      d.macro && h('details', {}, h('summary', { class: 'petit' }, 'Lecture macro du jour'), h('p', { class: 'petit' }, d.macro)),
      h('div', { class: 'ligne' },
        h('select', { onchange: (ev) => { synth.section = ev.target.value; rendre() } },
          ...SECTIONS_SYNTHESE.map(([k, l]) => h('option', { value: k, selected: k === synth.section }, `${l} (${k === 'tous' ? d.produits.length : (d.sections[k] || []).length})`))),
        h('button', { class: 'btn', onclick: () => { for (const p of liste) if (!listeNoire.has(p.id)) synth.choisis[p.id] = true; rendre() } }, 'Cocher la section'),
        h('button', { class: 'btn', disabled: !n, onclick: () => { synth.choisis = {}; rendre() } }, 'Tout décocher'),
        h('span', { class: 'petit' }, `${n} produit(s) coché(s)`)),
      synth.section === 'listeNoire' && h('p', { class: 'petit' }, 'Liste noire : produits que la synthèse déconseille d’acheter. Ils ne se cochent pas avec « Cocher la section ».'),
      h('table', {},
        h('thead', {}, h('tr', {}, ['', 'Produit', 'Rayon', 'Décision', 'Score', 'Coût rendu', 'Prix visé', 'Marge'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...liste.map((p) => h('tr', {},
          h('td', {}, h('input', { type: 'checkbox', checked: Boolean(synth.choisis[p.id]), onchange: (ev) => { synth.choisis[p.id] = ev.target.checked; rendre() } })),
          h('td', {}, p.nom, p.variante && h('div', { class: 'doux petit' }, p.variante)),
          h('td', { class: 'petit' }, [p.categorieLabel, p.themeLabel].filter(Boolean).join(' › ')),
          h('td', { class: 'petit' }, listeNoire.has(p.id) ? pastille(p.decision || 'liste noire', 'mauvais') : p.decision || '—'),
          h('td', {}, p.score === null ? '—' : String(p.score)),
          h('td', {}, euro(p.coutRendu)), h('td', {}, euro(p.prixVente)), h('td', {}, euro(p.margeNette)))))),
    ),
    d && h('div', { class: 'carte' },
      h('label', {}, 'Compte DropShipper qui reçoit les produits'),
      h('div', { class: 'ligne' },
        h('div', { style: 'flex:1;min-width:260px' }, h('input', { type: 'email', list: 'kantix-comptes', value: synth.email, placeholder: 'Adresse du compte (ex. vendeur@gmail.com)', oninput: (ev) => { synth.email = ev.target.value; synth.bilan = null; synth.compte = null } })),
        h('button', { class: 'btn', disabled: !adresseOk || Boolean(synth.enCours), onclick: synthVerifierCompte }, synth.enCours === 'compte' ? 'Vérification…' : 'Vérifier le compte'),
        h('button', { class: 'btn', disabled: Boolean(synth.enCours), onclick: synthComptes }, synth.enCours === 'comptes' ? 'Lecture…' : 'Choisir parmi les comptes'),
        h('button', { class: 'btn', disabled: Boolean(synth.enCours), onclick: synthGoogle }, synth.enCours === 'google' ? 'En attente du navigateur…' : 'Connecter avec Google')),
      h('datalist', { id: 'kantix-comptes' }, ...(synth.comptes || []).map((c) => h('option', { value: c.email }, c.shopName || c.email))),
      synth.comptes && h('p', { class: 'doux petit' }, `${synth.comptes.length} compte(s) chargé(s) : commencez à taper l’adresse pour choisir.`),
      compte && h('p', { class: 'petit' }, pastille('compte trouvé', 'bon'), ` ${compte.compte.boutique || compte.compte.email} · ${compte.produits} annonce(s) déjà sur ce compte`),
      h('p', { class: 'doux petit' }, 'Désignez le compte par son adresse, ou « Connecter avec Google » : la page de connexion du site s’ouvre dans votre navigateur (Google refuse sa connexion dans une application), et seule l’adresse du compte revient ici. L’import se fait avec la clé d’administration ; aucun mot de passe ne passe par KANTIX.'),
      h('div', { class: 'ligne' },
        h('button', { class: 'btn', disabled: !n || !adresseOk || Boolean(synth.enCours), onclick: () => synthImporter(true) }, synth.enCours === 'essai' ? 'Vérification…' : 'Vérifier (rien n’est écrit)'),
        h('button', { class: 'btn principal', disabled: !n || !adresseOk || Boolean(synth.enCours), onclick: () => synthImporter(false) }, synth.enCours === 'import' ? 'Import en cours…' : `Importer ${n} produit(s) sur ce compte`)),
      synth.bilan && h('p', {}, synth.bilan.essai ? 'Vérification : ' : 'Import terminé : ',
        `${synth.bilan.nombre} ${synth.bilan.essai ? 'à importer' : 'importé(s) en brouillon'}, ${synth.bilan.doublons} déjà sur le compte, ${synth.bilan.inconnus} introuvable(s) dans la synthèse — compte ${synth.bilan.compte}.`)),
  )
}

// ---------------------------------------------------------------- réseaux sociaux du site
// Icons of the site footer: one only appears when its link is filled. The site validates (https, host of the network).
const RESEAUX = [
  ['facebook', 'Facebook', 'https://www.facebook.com/…'],
  ['instagram', 'Instagram', 'https://www.instagram.com/…'],
  ['whatsapp', 'WhatsApp', 'https://wa.me/33…'],
  ['x', 'X (Twitter)', 'https://x.com/…'],
  ['linkedin', 'LinkedIn', 'https://www.linkedin.com/company/…'],
  ['snapchat', 'Snapchat', 'https://www.snapchat.com/add/…'],
]
const reseaux = { liens: null, champs: {}, erreur: null, enCours: false }

async function chargerReseaux() {
  reseaux.erreur = null
  flash('Lecture des liens sur le site…')
  const x = await appel('adminReseaux')
  if (x) { reseaux.liens = x.reseaux || {}; reseaux.champs = {}; flash('') }
}

async function enregistrerReseaux() {
  const corps = Object.fromEntries(RESEAUX.map(([id]) => [id, (reseaux.champs[id] ?? reseaux.liens[id] ?? '').trim() || null]))
  reseaux.enCours = true; reseaux.erreur = null; flash('Enregistrement sur le site…')
  const r = await window.poste.adminReseauxEnregistrer(corps)
  reseaux.enCours = false
  if (!r.ok) { reseaux.erreur = r.erreur; flash(''); return }
  reseaux.liens = r.valeur.reseaux || {}; reseaux.champs = {}
  flash('Enregistré : le pied de page du site affiche maintenant ces icônes.')
}

function vueReseaux() {
  if (!etat.admin.cle) return sansCleAdmin('Réseaux sociaux du site')
  const l = reseaux.liens
  return h('div', {},
    h('h1', {}, 'Réseaux sociaux du site'),
    h('div', { class: 'carte' },
      h('p', { class: 'doux petit' }, 'Liens des icônes du pied de page de drop-shipper.fr. Une icône n’apparaît que si son lien est rempli ; videz un champ pour retirer l’icône. Adresse complète en https.'),
      !l && h('div', { class: 'ligne' }, h('button', { class: 'btn', onclick: chargerReseaux }, 'Afficher les liens du site')),
      l && RESEAUX.map(([id, nom, exemple]) => h('label', {}, h('span', {}, nom),
        h('input', { value: reseaux.champs[id] ?? l[id] ?? '', placeholder: exemple, oninput: (ev) => { reseaux.champs[id] = ev.target.value } }))),
      l && h('div', { class: 'ligne' },
        h('button', { class: 'btn principal', disabled: reseaux.enCours, onclick: enregistrerReseaux }, 'Enregistrer'),
        h('button', { class: 'btn', onclick: chargerReseaux }, 'Relire le site')),
      reseaux.erreur && h('p', { class: 'erreur' }, reseaux.erreur),
      messageFlash && h('p', { class: 'petit' }, messageFlash),
    ),
  )
}

// ---------------------------------------------------------------- affiliation
// Payout data (IBAN included) stays in memory on the screen, never written to disk.
let donneesAffiliation = null
const euros = (c) => (c / 100).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
const ibanMasque = (iban) => (iban ? `${iban.slice(0, 4)} •••• ${iban.slice(-4)}` : '—')

async function chargerAffiliation() {
  flash('Lecture des affiliés sur le site…')
  const x = await appel('adminAffiliation')
  if (x) { donneesAffiliation = x; flash('') }
}

function vueAffiliation() {
  if (!etat.admin.cle) return sansCleAdmin('Affiliation')
  const d = donneesAffiliation
  return h('div', {},
    h('h1', {}, 'Affiliation : versements du mois'),
    h('div', { class: 'carte' },
      h('p', { class: 'doux petit' }, '10 % à vie sur chaque recharge du filleul. Virement mensuel dès le seuil, fait à la banque ; « Versé » solde les commissions et prévient l’affilié par e-mail.'),
      h('div', { class: 'ligne' }, h('button', { class: 'btn', onclick: chargerAffiliation }, d ? 'Actualiser' : 'Afficher les affiliés')),
      messageFlash && h('p', { class: 'petit' }, messageFlash),
      d && h('p', {}, `${d.totaux.affilies} affilié(s) · ${d.totaux.aVerser} à verser ce mois (${euros(d.totaux.dusAVerserCentimes)}) · dû au total ${euros(d.totaux.dusCentimes)} · déjà versé ${euros(d.totaux.versesCentimes)} · seuil ${euros(d.seuilCentimes)}`),
    ),
    d && d.affilies.length > 0 && h('div', { class: 'carte' },
      h('table', {},
        h('thead', {}, h('tr', {}, ['Affilié', 'Code', 'Filleuls', 'Dû', 'Versé', 'IBAN', ''].map((t) => h('th', {}, t)))),
        h('tbody', {}, d.affilies.map((a) => {
          const ref = h('input', { placeholder: 'Référence du virement (facultatif)' })
          return h('tr', {},
            h('td', {}, a.nom, h('div', { class: 'petit doux' }, a.email)),
            h('td', {}, a.code),
            h('td', {}, `${a.filleuls} (${a.clics} clics)`),
            h('td', {}, euros(a.dusCentimes), ' ', a.aVerser ? pastille('à verser', 'alerte') : null),
            h('td', {}, euros(a.versesCentimes)),
            h('td', {}, ibanMasque(a.iban), a.titulaire ? h('div', { class: 'petit doux' }, a.titulaire) : null,
              a.iban && h('button', { class: 'btn', onclick: async () => { if (await appel('copier', a.iban)) flash(`IBAN de ${a.nom} copié.`) } }, 'Copier l’IBAN')),
            h('td', {}, a.dusCentimes > 0 && a.iban ? h('div', {}, ref, h('button', { class: 'btn principal', onclick: async () => {
              const r = await appel('adminAffiliationVerser', { id: a.id, nom: a.nom, montant: euros(a.dusCentimes), reference: ref.value.trim() })
              if (r && !r.annule) { flash(`Versement de ${a.nom} enregistré.`); await chargerAffiliation() }
            } }, 'Versé')) : null),
          )
        })),
      ),
    ),
    d && d.affilies.length === 0 && h('div', { class: 'carte' }, h('p', { class: 'doux' }, 'Aucun affilié pour l’instant.')),
  )
}

// ---------------------------------------------------------------- réglages
// Google keyword volumes come through the site; this card only says whether a real call works.
const motsCles = { resultat: null, erreur: null, enCours: false }
async function essayerMotsCles() {
  motsCles.enCours = true; motsCles.resultat = null; motsCles.erreur = null; rendre()
  const r = await window.poste.adminMotsClesEssai()
  motsCles.enCours = false
  if (r.ok) motsCles.resultat = r.valeur; else motsCles.erreur = r.erreur
  rendre()
}
function blocMotsCles() {
  const r = motsCles.resultat
  const ex = r && r.exemple
  const message = motsCles.erreur ? h('p', { class: 'erreur' }, motsCles.erreur)
    : !r ? null
    : !r.configure ? h('p', {}, pastille('pas branché', 'mauvais'), ' Variables Railway manquantes : ', (r.manque || []).join(', '), '. Les analyses continuent sans les volumes.')
    : r.verifie ? h('p', {}, pastille('connecté', 'bon'), ` Appel réel réussi : « ${ex ? ex.texte : 'coque iphone'} » = ${ex && ex.volumeMensuel !== null ? `${ex.volumeMensuel.toLocaleString('fr-FR')} recherches par mois` : 'volume non communiqué'}.`)
    : h('p', {}, 'Variables posées, appel réel non fait.')
  return h('div', { class: 'carte' },
    h('h2', {}, 'Mots-clés Google (Planificateur Google Ads, via le site)'),
    h('p', { class: 'doux petit' }, 'Pendant l’analyse d’un rayon, le Poste demande au site le volume de recherche mensuel en France de chaque produit et le range avec lui. Sans branchement, l’analyse continue sans ces chiffres.'),
    !etat.admin.cle ? h('p', { class: 'doux petit' }, 'Il faut d’abord la clé d’administration (ci-dessus).')
      : h('div', { class: 'ligne' }, h('button', { class: 'btn', disabled: motsCles.enCours, onclick: essayerMotsCles }, motsCles.enCours ? 'Essai en cours…' : 'Essai mots-clés')),
    message,
  )
}

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
  const se = r.serperEtendu
  const caseShopping = h('input', { type: 'checkbox', checked: se.shopping })
  const caseAuto = h('input', { type: 'checkbox', checked: se.autocomplete })
  const caseImages = h('input', { type: 'checkbox', checked: se.images })
  const avecSerper = r.moteurRecherche === 'serper'
  const moteur = h('select', {},
    h('option', { value: 'claude', selected: !avecSerper }, 'Recherche web de l’IA des rayons (Claude, GPT, Gemini ou Perplexity), sans Serper'),
    h('option', { value: 'serper', selected: avecSerper }, 'Serper (clé et crédits Serper)'))
  return h('div', {},
    h('h1', {}, 'Réglages'),
    h('div', { class: 'carte' },
      h('h2', {}, 'Clés (saisies par vous, chiffrées par Windows, jamais réaffichées)'),
      h('div', {}, h('label', {}, 'Clé IA des rayons ', pastille(e.secrets.anthropic ? 'posée' : 'absente', e.secrets.anthropic ? 'bon' : 'mauvais')),
        h('div', { class: 'ligne' },
          h('div', { style: 'flex:1;min-width:220px' }, h('select', { onchange: async (ev) => { const x = await appel('connecteurCle', { cleId: ev.target.value }); if (x) { etat = x; flash('Clé des rayons enregistrée.') } } },
            h('option', { value: '' }, e.secrets.anthropic && !e.kantix.connecteurs.dropshipper.cleId ? 'ancienne clé du Poste' : e.kantix.cles.length ? '— choisir —' : 'aucune clé : « Gérer les clés API »'),
            e.kantix.cles.map((c) => h('option', { value: c.id, selected: c.id === e.kantix.connecteurs.dropshipper.cleId }, `${c.nom} · ${c.fournisseur}`)))),
          h('button', { class: 'btn', onclick: () => aller('cles') }, 'Gérer les clés API'))),
      avecSerper && cle('serper', 'Clé API Serper'),
      blocCleAdmin(),
    ),
    blocMotsCles(),
    h('div', { class: 'carte' },
      h('h2', {}, 'Agents'),
      f('modele', 'Modèle Claude', r.modele),
      h('div', {}, h('label', {}, 'Moteur de recherche web'), moteur),
      !avecSerper && f('modeleRecherche', 'Modèle des recherches web (vide = Haiku 5.5, le moins cher)', r.modeleRecherche || ''),
      !avecSerper && h('p', { class: 'doux petit' }, `Recherche web d’Anthropic : 0,01 $ par recherche, plus la lecture des résultats. Un rayon : ${r.coutParRayon}.`),
      f('espaceAnthropic', 'Identifiant d’espace de travail Anthropic (seulement si l’API répond « not scoped to a workspace »)', r.espaceAnthropic || ''),
      f('heureNuit', 'Heure de la nuit (HH:MM)', r.heureNuit),
      f('plafondPages', 'Pages lues par rayon', r.plafondPages, 'number'),
      f('plafondDeuxiemeVague', 'Modèles cherchés en deuxième vague (une recherche web par modèle)', r.plafondDeuxiemeVague, 'number'),
      h('label', {}, h('span', {}, envoi, ' Envoyer chaque rapport validé au site drop-shipper.fr (rayon et marketing, rangés par le site)')),
      h('label', {}, h('span', {}, caseTrends, ' Lire Google Trends (courbe de recherche du thème et des modèles, France 12 mois)')),
      h('label', {}, h('span', {}, caseMeta, ' Lire la Meta Ad Library (annonces actives par modèle)')),
      f('plafondPubs', 'Modèles cherchés dans la Meta Ad Library par rayon', sp.plafondPubsParRayon, 'number'),
      h('p', { class: 'doux petit' }, 'Lectures publiques dans une fenêtre cachée, espacées de 4 s ; le premier blocage ou la première demande de connexion arrête la source pour la nuit. Vérifiez les conditions d’utilisation de ces sites.'),
      avecSerper && h('label', {}, h('span', {}, caseShopping, ' Serper Shopping : prix et vendeurs réels en France (1 crédit par modèle)')),
      avecSerper && f('plafondShopping', 'Modèles cherchés dans Shopping par rayon', se.plafondShopping, 'number'),
      avecSerper && h('label', {}, h('span', {}, caseAuto, ' Serper Autocomplétion : ce que les acheteurs commencent à taper (7 crédits par rayon)')),
      avecSerper && h('label', {}, h('span', {}, caseImages, ' Serper Images : adresses d’images réelles (1 crédit par modèle)')),
      avecSerper && f('plafondImages', 'Modèles cherchés dans Images par rayon', se.plafondImages, 'number'),
      avecSerper && h('p', { class: 'doux petit' }, `Un rayon dépense au plus ${r.creditsSerperParRayon} crédits Serper avec ces réglages.`),
      f('apiBase', 'Adresse de l’API', r.apiBase),
      h('p', {}, h('button', { class: 'btn principal', onclick: async () => {
        const x = await appel('reglages', {
          modele: champs.modele.value.trim(), moteurRecherche: moteur.value, modeleRecherche: champs.modeleRecherche ? champs.modeleRecherche.value.trim() : undefined, espaceAnthropic: champs.espaceAnthropic.value.trim(), heureNuit: champs.heureNuit.value.trim(), plafondPages: Number(champs.plafondPages.value),
          plafondDeuxiemeVague: Number(champs.plafondDeuxiemeVague.value), apiBase: champs.apiBase.value.trim(), envoiAuSite: envoi.checked,
          signauxPublics: { meta: caseMeta.checked, trends: caseTrends.checked, plafondPubsParRayon: Number(champs.plafondPubs.value) },
          serperEtendu: avecSerper ? { shopping: caseShopping.checked, autocomplete: caseAuto.checked, images: caseImages.checked, plafondShopping: Number(champs.plafondShopping.value), plafondImages: Number(champs.plafondImages.value) } : undefined,
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
    h('div', { class: 'journal' }, etat.journal.length ? etat.journal.slice().reverse().map((l) => h('div', { class: l.niveau === 'erreur' ? 'erreur' : '' }, `${l.t.slice(11, 19)}  ${l.message}${l.raison ? ' — ' + l.raison : ''}`, ...(Array.isArray(l.motifs) ? l.motifs : []).map((m) => h('div', { class: 'petit' }, `   refusé : ${m}`)))) : 'Rien pour l’instant.'))
}

// ---------------------------------------------------------------- cadre
function rendre() {
  if (typeof GROUPES_MENU === 'undefined') return // an 'etat' push before kantix.js has loaded
  const barre = document.getElementById('onglets')
  const groupes = etat ? GROUPES_MENU.filter((g) => !g.si || g.si(etat)) : []
  // a page of a connector that was switched off falls back on the analyses
  if (etat && !groupes.some((g) => g.onglets.some(([id]) => id === onglet))) onglet = 'analyses'
  barre.replaceChildren(...groupes.flatMap((g) => [
    g.titre ? h('div', { class: 'groupe-menu' }, g.titre) : null,
    ...g.onglets.map(([id, titre]) => h('button', { class: id === onglet ? 'actif' : '', 'data-onglet': id, onclick: () => aller(id) }, titre)),
  ].filter(Boolean)))
  document.getElementById('pied').textContent = etat ? `Version ${etat.version}` : ''
  const contenu = document.getElementById('contenu')
  if (!etat) { contenu.replaceChildren(h('p', {}, 'Chargement…')); return }
  const vues = { ...VUES_KANTIX, accueil: vueAccueil, rapports: vueRapports, administration: vueAdministration, newsletter: vueNewsletter, drive: vueDrive, syntheses: vueSyntheses, affiliation: vueAffiliation, reseaux: vueReseaux, reglages: vueReglages, journal: vueJournal }
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
// kantix.js (menu, pages) loads after this file: the first render waits for every script
window.addEventListener('DOMContentLoaded', async () => { etat = await appel('etat'); rendre() })
