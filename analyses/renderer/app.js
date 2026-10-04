'use strict'
/* The screen. Data is only ever put in with textContent: nothing from a report or a site is parsed as HTML. */

const ONGLETS = [
  ['accueil', 'Tableau de bord'],
  ['rapports', 'Rapports du jour'],
  ['sources', 'Sources & navigateur'],
  ['administration', 'Administration'],
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

// Rayons run by the night: ids = list of category ids, null = all of them.
async function choisirRayons(ids) {
  const x = await appel('rayonsNuit', { ids })
  if (x) { etat = x; rendre() }
}

// ---------------------------------------------------------------- tableau de bord
function vueAccueil() {
  const e = etat
  const cles = e.secrets
  const toutesCles = cles.anthropic && cles.serper
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
        h('div', {}, 'Clé Anthropic ', pastille(cles.anthropic ? 'posée' : 'absente', cles.anthropic ? 'bon' : 'mauvais')),
        h('div', {}, 'Clé Serper ', pastille(cles.serper ? 'posée' : 'absente', cles.serper ? 'bon' : 'mauvais')),
        h('div', {}, 'Sources de données ', pastille(String(e.sources.length), e.sources.length ? 'bon' : '')),
        !toutesCles && h('p', { class: 'doux petit' }, 'Posez vos clés dans Réglages : elles restent chiffrées sur ce PC.'),
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
          if (r) flash(`Anthropic : ${r.claude.ok ? 'OK' : r.claude.message} — Serper : ${r.serper.ok ? 'OK' : r.serper.message}`)
        } }, 'Contrôler les crédits (1 crédit)'),
        h('button', { class: 'btn principal', disabled: e.nuit.enCours || !toutesCles, onclick: async () => { const r = await appel('rayonTest'); if (r && !r.annule) flash(`Rayon test : ${r.statut}`) } }, 'Lancer UN rayon test'),
        h('button', { class: 'btn', disabled: e.nuit.enCours || !toutesCles || !choisis, onclick: async () => { const r = await appel('nuitLancer'); if (r && !r.annule) flash(r.annulee ? `Nuit annulée : ${r.annulee}` : 'Nuit terminée') } }, choisis === total ? 'Lancer la nuit complète' : `Lancer ${choisis} rayon${choisis > 1 ? 's' : ''} sur ${total}`),
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
      h('p', { class: 'doux petit' }, 'À n’activer qu’après un rayon test dont vous avez validé la qualité (20 produits, 20 URL distinctes, marges en euros). Coût : environ 0,39 € par rayon coché (24 rayons ≈ 9,40 €). Les rayons se choisissent dans « Rapports du jour ».'),
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
      h('div', { class: 'ligne' }, h('button', { class: 'btn', disabled: !a.cle, onclick: chargerAdmin }, d ? 'Actualiser' : 'Afficher les utilisateurs')),
      d && h('div', {},
        h('p', {}, `${d.total} compte(s), dont ${d.verifies} adresse(s) confirmée(s) ; ${d.abonnesNewsletter} abonné(s) à la newsletter.`, d.total > d.utilisateurs.length ? ` Les ${d.utilisateurs.length} plus récents sont listés.` : ''),
        h('table', {},
          h('thead', {}, h('tr', {}, ['Inscrit le', 'E-mail', 'Boutique', 'Offre', 'Drops', 'Adresse'].map((t) => h('th', {}, t)))),
          h('tbody', {}, d.utilisateurs.map((u) => h('tr', {},
            h('td', {}, dateCourte(u.createdAt)), h('td', {}, u.email), h('td', {}, u.shopName || '—'), h('td', {}, String(u.plan || '—')), h('td', {}, String(u.credits)),
            h('td', {}, u.emailVerifiedAt ? pastille('confirmée', 'bon') : pastille('non confirmée', ''))))),
        ),
      ),
      d && d.newsletter && h('div', {},
        h('h2', {}, `Newsletter (${d.newsletter.total})`),
        h('table', {}, h('tbody', {}, d.newsletter.subscribers.slice(0, 200).map((s) => h('tr', {}, h('td', {}, dateCourte(s.createdAt)), h('td', {}, s.email), h('td', {}, s.source || '—'))))),
      ),
      h('p', { class: 'doux petit' }, 'Ces données personnelles restent à l’écran, elles ne sont écrites nulle part sur ce PC. Contacter les utilisateurs, voir les boutiques, générer des jetons et des clés d’API, connexion MCP : à venir, selon l’architecture que vous fournirez.'),
    ),
  )
}

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
  const se = r.serperEtendu
  const caseShopping = h('input', { type: 'checkbox', checked: se.shopping })
  const caseAuto = h('input', { type: 'checkbox', checked: se.autocomplete })
  const caseImages = h('input', { type: 'checkbox', checked: se.images })
  return h('div', {},
    h('h1', {}, 'Réglages'),
    h('div', { class: 'carte' },
      h('h2', {}, 'Clés (saisies par vous, chiffrées par Windows, jamais réaffichées)'),
      cle('anthropic', 'Clé API Anthropic'), cle('serper', 'Clé API Serper'),
      h('p', { class: 'doux petit' }, 'La clé d’administration du site se crée dans l’onglet Administration (le Poste la fabrique lui-même).'),
    ),
    h('div', { class: 'carte' },
      h('h2', {}, 'Agents'),
      f('modele', 'Modèle Claude', r.modele),
      f('espaceAnthropic', 'Identifiant d’espace de travail Anthropic (seulement si l’API répond « not scoped to a workspace »)', r.espaceAnthropic || ''),
      f('heureNuit', 'Heure de la nuit (HH:MM)', r.heureNuit),
      f('plafondPages', 'Pages lues par rayon', r.plafondPages, 'number'),
      f('plafondDeuxiemeVague', 'Modèles cherchés en deuxième vague (plafond Serper)', r.plafondDeuxiemeVague, 'number'),
      h('label', {}, h('span', {}, envoi, ' Envoyer chaque rapport validé au site drop-shipper.fr (rayon et marketing, rangés par le site)')),
      h('label', {}, h('span', {}, caseTrends, ' Lire Google Trends (courbe de recherche du thème et des modèles, France 12 mois)')),
      h('label', {}, h('span', {}, caseMeta, ' Lire la Meta Ad Library (annonces actives par modèle)')),
      f('plafondPubs', 'Modèles cherchés dans la Meta Ad Library par rayon', sp.plafondPubsParRayon, 'number'),
      h('p', { class: 'doux petit' }, 'Lectures publiques dans une fenêtre cachée, espacées de 4 s ; le premier blocage ou la première demande de connexion arrête la source pour la nuit. Vérifiez les conditions d’utilisation de ces sites.'),
      h('label', {}, h('span', {}, caseShopping, ' Serper Shopping : prix et vendeurs réels en France (1 crédit par modèle)')),
      f('plafondShopping', 'Modèles cherchés dans Shopping par rayon', se.plafondShopping, 'number'),
      h('label', {}, h('span', {}, caseAuto, ' Serper Autocomplétion : ce que les acheteurs commencent à taper (7 crédits par rayon)')),
      h('label', {}, h('span', {}, caseImages, ' Serper Images : adresses d’images réelles (1 crédit par modèle)')),
      f('plafondImages', 'Modèles cherchés dans Images par rayon', se.plafondImages, 'number'),
      h('p', { class: 'doux petit' }, `Un rayon dépense au plus ${r.creditsSerperParRayon} crédits Serper avec ces réglages.`),
      f('apiBase', 'Adresse de l’API', r.apiBase),
      h('p', {}, h('button', { class: 'btn principal', onclick: async () => {
        const x = await appel('reglages', {
          modele: champs.modele.value.trim(), espaceAnthropic: champs.espaceAnthropic.value.trim(), heureNuit: champs.heureNuit.value.trim(), plafondPages: Number(champs.plafondPages.value),
          plafondDeuxiemeVague: Number(champs.plafondDeuxiemeVague.value), apiBase: champs.apiBase.value.trim(), envoiAuSite: envoi.checked,
          signauxPublics: { meta: caseMeta.checked, trends: caseTrends.checked, plafondPubsParRayon: Number(champs.plafondPubs.value) },
          serperEtendu: { shopping: caseShopping.checked, autocomplete: caseAuto.checked, images: caseImages.checked, plafondShopping: Number(champs.plafondShopping.value), plafondImages: Number(champs.plafondImages.value) },
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
  const vues = { accueil: vueAccueil, rapports: vueRapports, sources: vueSources, administration: vueAdministration, reglages: vueReglages, journal: vueJournal }
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
