/**
 * Le blog et les pages de confiance, en vraies pages HTML.
 *
 * Même raison que build-seo.cjs : l'application React sert la même coquille
 * vide à toutes les adresses, et ni les robots des assistants ni une partie des
 * moteurs n'exécutent JavaScript. Ici, chaque article est un fichier HTML
 * complet, au gabarit des autres pages publiques (layout de build-seo.cjs).
 *
 *   content/blog/<adresse>.md  →  dist/blog/<adresse>/index.html
 *   (+ /blog/, /contact/, /cgu/, /cookies/, et /mentions-legales/ dès que
 *    scripts/editeur.cjs porte les champs obligatoires)
 *
 * Les articles vivent dans le dépôt : pas de base, pas de migration. Pour en
 * publier un, ajouter un fichier .md (en-tête entre deux lignes `---`, puis le
 * texte) et pousser. Passe EN DERNIER dans `npm run build` : build-geo.cjs a
 * déjà renommé le sitemap des pages en sitemap-pages.xml, on y ajoute les nôtres.
 *
 * Banc : node scripts/build-blog.cjs --verifier (sans dist/, contrôle les
 * articles : en-têtes, longueurs, liens internes, aucune adresse fournisseur).
 */
const fs = require('node:fs')
const path = require('node:path')

const { layout, esc, breadcrumbLd, crumb, SITE, TODAY } = require('./build-seo.cjs')
const { ENTREPRISE, EDITEUR, manquants, lignesConnues, etablissementLd } = require('./editeur.cjs')

const DIST = path.resolve(__dirname, '..', 'dist')
const CONTENU = path.resolve(__dirname, '..', 'content', 'blog')
const NOM = 'DropShipper IA'
const EMAIL = EDITEUR.email

/* ------------------------------------------------------------------ */
/* Lecture des articles                                                */
/* ------------------------------------------------------------------ */

/** En-tête `cle: valeur` entre deux lignes `---`, puis le corps en Markdown. */
function lireArticle(fichier) {
  const brut = fs.readFileSync(fichier, 'utf8').replace(/\r\n/g, '\n')
  const m = brut.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!m) throw new Error(`${path.basename(fichier)} : en-tête --- absent`)
  const meta = {}
  for (const ligne of m[1].split('\n')) {
    const i = ligne.indexOf(':')
    if (i > 0) meta[ligne.slice(0, i).trim()] = ligne.slice(i + 1).trim()
  }
  const slug = path.basename(fichier, '.md')
  return { slug, url: `/blog/${slug}/`, ...meta, markdown: m[2].trim() }
}

function articles() {
  if (!fs.existsSync(CONTENU)) return []
  return fs
    .readdirSync(CONTENU)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => lireArticle(path.join(CONTENU, f)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)))
}

/* ------------------------------------------------------------------ */
/* Markdown → HTML (le sous-ensemble dont les articles ont besoin)     */
/* ------------------------------------------------------------------ */

function enLigne(texte) {
  return esc(texte)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
      const externe = /^https?:/.test(href) && !href.startsWith(SITE)
      return `<a href="${href}"${externe ? ' rel="nofollow noopener" target="_blank"' : ''}>${label}</a>`
    })
}

function markdown(md) {
  const sortie = []
  const lignes = md.split('\n')
  let i = 0
  while (i < lignes.length) {
    const l = lignes[i]
    if (!l.trim()) { i++; continue }
    let m
    if ((m = l.match(/^(#{2,3})\s+(.*)$/))) {
      const niveau = m[1].length
      const id = m[2].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      sortie.push(`<h${niveau} id="${id}">${enLigne(m[2])}</h${niveau}>`)
      i++
    } else if (/^\s*[-*]\s+/.test(l)) {
      const items = []
      while (i < lignes.length && /^\s*[-*]\s+/.test(lignes[i])) items.push(lignes[i++].replace(/^\s*[-*]\s+/, ''))
      sortie.push(`<ul>${items.map((t) => `<li>${enLigne(t)}</li>`).join('')}</ul>`)
    } else if (/^\s*\d+\.\s+/.test(l)) {
      const items = []
      while (i < lignes.length && /^\s*\d+\.\s+/.test(lignes[i])) items.push(lignes[i++].replace(/^\s*\d+\.\s+/, ''))
      sortie.push(`<ol>${items.map((t) => `<li>${enLigne(t)}</li>`).join('')}</ol>`)
    } else if (l.startsWith('|')) {
      const rangs = []
      while (i < lignes.length && lignes[i].startsWith('|')) rangs.push(lignes[i++])
      const cellules = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
      const [tete, , ...corps] = rangs
      sortie.push(
        `<div class="table"><table><thead><tr>${cellules(tete).map((c) => `<th>${enLigne(c)}</th>`).join('')}</tr></thead><tbody>${corps
          .map((r) => `<tr>${cellules(r).map((c) => `<td>${enLigne(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      )
    } else if (l.startsWith('> ')) {
      const bloc = []
      while (i < lignes.length && lignes[i].startsWith('> ')) bloc.push(lignes[i++].slice(2))
      sortie.push(`<p class="note">${enLigne(bloc.join(' '))}</p>`)
    } else {
      const bloc = []
      while (i < lignes.length && lignes[i].trim() && !/^(#{2,3}\s|\s*[-*]\s|\s*\d+\.\s|\||> )/.test(lignes[i])) bloc.push(lignes[i++])
      sortie.push(`<p>${enLigne(bloc.join(' '))}</p>`)
    }
  }
  return sortie.join('\n')
}

const mots = (md) => md.replace(/[#*|>\[\]()-]/g, ' ').split(/\s+/).filter(Boolean).length

/** « 2026-10-07 » → « 7 octobre 2026 ». */
function dateFr(iso) {
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
  const [a, m, j] = iso.split('-').map(Number)
  return `${j === 1 ? '1er' : j} ${mois[m - 1]} ${a}`
}

/* ------------------------------------------------------------------ */
/* Pages du blog                                                       */
/* ------------------------------------------------------------------ */

const STYLE_BLOG = `<style>
.meta{font-size:.85rem;color:#9d95c0;margin:.25rem 0 1.25rem}
.article h2{margin-top:2.5rem}
.article ol{padding-left:1.3rem}
.table{overflow-x:auto;-webkit-overflow-scrolling:touch}
.table table{min-width:32rem}
.liste{list-style:none;padding:0}
.liste li{margin:0}
.liste a{display:block;border:1px solid #ffffff1a;background:#ffffff0d;border-radius:.9rem;padding:1rem 1.15rem;margin:.8rem 0;text-decoration:none;color:#e9e6f5}
.liste a:hover{border-color:#c4b5fd66}
.liste strong{display:block;font-size:1.08rem;color:#fff;margin-bottom:.25rem}
.liste span{display:block;font-size:.92rem;color:#cfc9e8}
.liste small{display:block;margin-top:.4rem;color:#9d95c0}
</style>`

/** Le gabarit commun ne connaît pas nos styles : on les glisse juste avant </head>. */
const avecStyle = (html) => html.replace('</head>', `${STYLE_BLOG}\n</head>`)

const auteurLd = (a) =>
  a.auteur && a.auteur !== NOM
    ? { '@type': 'Person', name: a.auteur }
    : { '@type': 'Organization', name: NOM, url: `${SITE}/` }

function pageArticle(a, tous) {
  const trail = [{ name: 'Accueil', url: '/' }, { name: 'Blog', url: '/blog/' }, { name: a.titre, url: a.url }]
  const autres = tous.filter((x) => x.slug !== a.slug)
  const nbMots = mots(a.markdown)
  const maj = a.maj || a.date
  return {
    url: a.url,
    html: avecStyle(
      layout({
        url: a.url,
        title: a.titreSeo || a.titre,
        description: a.description,
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: a.titre,
            description: a.description,
            datePublished: a.date,
            dateModified: maj,
            inLanguage: 'fr-FR',
            wordCount: nbMots,
            image: `${SITE}/marque/dropshipper-complet.png`,
            author: auteurLd(a),
            publisher: { '@type': 'Organization', '@id': `${SITE}/#organisation`, name: NOM, url: `${SITE}/`, logo: { '@type': 'ImageObject', url: `${SITE}/icone-512.png` } },
            mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}${a.url}` },
            isPartOf: { '@type': 'Blog', '@id': `${SITE}/blog/#blog`, name: `Le blog ${NOM}` },
          },
          breadcrumbLd(trail),
        ],
        body: `${crumb(trail)}
<article class="article">
<h1>${esc(a.titre)}</h1>
<p class="meta">Par ${esc(a.auteur || `l'équipe ${NOM}`)} · publié le <time datetime="${a.date}">${dateFr(a.date)}</time>${
          maj !== a.date ? ` · mis à jour le <time datetime="${maj}">${dateFr(maj)}</time>` : ''
        } · ${Math.max(1, Math.round(nbMots / 220))} min de lecture</p>
<p class="lede">${enLigne(a.chapo)}</p>
${markdown(a.markdown)}
</article>
<h2>À lire aussi</h2>
<ul class="liste">${autres
          .slice(0, 3)
          .map((x) => `<li><a href="${x.url}"><strong>${esc(x.titre)}</strong><span>${esc(x.description)}</span></a></li>`)
          .join('')}</ul>
<p><a href="/blog/">Tous les articles</a> · <a href="/tarifs/">Tarifs</a> · <a href="/faq/">Questions fréquentes</a> · <a href="/contact/">Contact</a></p>`,
      }),
    ),
  }
}

function pageIndex(tous) {
  const url = '/blog/'
  const trail = [{ name: 'Accueil', url: '/' }, { name: 'Blog', url }]
  return {
    url,
    html: avecStyle(
      layout({
        url,
        title: `Blog dropshipping : guides et analyses | ${NOM}`,
        description:
          'Le blog DropShipper IA : fournisseurs, niches de saison, annonces écrites par IA, vente sur Vinted et Leboncoin. Des guides pratiques, sourcés, en français.',
        jsonLd: [
          {
            '@context': 'https://schema.org',
            '@type': 'Blog',
            '@id': `${SITE}/blog/#blog`,
            name: `Le blog ${NOM}`,
            url: `${SITE}${url}`,
            inLanguage: 'fr-FR',
            publisher: { '@type': 'Organization', '@id': `${SITE}/#organisation`, name: NOM, url: `${SITE}/` },
            blogPost: tous.map((a) => ({ '@type': 'BlogPosting', headline: a.titre, url: `${SITE}${a.url}`, datePublished: a.date })),
          },
          breadcrumbLd(trail),
        ],
        body: `${crumb(trail)}
<h1>Le blog ${NOM}</h1>
<p class="lede">Des guides pratiques pour vendre en ligne sans stock : où trouver ses produits, quoi vendre selon la saison, comment rédiger et diffuser ses annonces. Chaque chiffre cité a sa source ; ce qui relève de l'outil renvoie à ce qu'il fait réellement.</p>
<ul class="liste">${tous
          .map(
            (a) =>
              `<li><a href="${a.url}"><strong>${esc(a.titre)}</strong><span>${esc(a.description)}</span><small>${dateFr(a.date)}</small></a></li>`,
          )
          .join('')}</ul>
<h2>Pour aller plus loin</h2>
<p>Les <a href="/analyses/">analyses de marché</a> des agents sont publiées chaque jour, rayon par rayon. Les guides de fond : <a href="/dropshipping/">le dropshipping, comment ça marche</a>, <a href="/vendre-sur-marketplaces/">où vendre</a>, <a href="/logiciel-dropshipping/">ce que doit faire un logiciel de dropshipping</a>.</p>`,
      }),
    ),
  }
}

/* ------------------------------------------------------------------ */
/* Pages de confiance                                                  */
/* ------------------------------------------------------------------ */

function pageSimple({ url, nom, title, description, type = 'WebPage', corps, ld = [] }) {
  const trail = [{ name: 'Accueil', url: '/' }, { name: nom, url }]
  return {
    url,
    html: avecStyle(
      layout({
        url,
        title,
        description,
        jsonLd: [{ '@context': 'https://schema.org', '@type': type, name: nom, url: `${SITE}${url}`, inLanguage: 'fr-FR' }, breadcrumbLd(trail), ...ld],
        body: `${crumb(trail)}\n${corps}`,
      }),
    ),
  }
}

function pageContact() {
  return pageSimple({
    url: '/contact/',
    nom: 'Contact',
    type: 'ContactPage',
    ld: [{ '@context': 'https://schema.org', ...etablissementLd(SITE) }],
    title: `Contacter ${NOM}`,
    description: `Écrire à l'équipe ${NOM} : question avant inscription, aide sur votre compte, données personnelles, partenariat. Une adresse lue par l'équipe.`,
    corps: `<h1>Contacter ${NOM}</h1>
<p class="lede">Une seule adresse, lue par l'équipe : <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>
<h2>Nous trouver</h2>
<p><strong>${esc(ENTREPRISE.nom)}</strong><br>${esc(ENTREPRISE.adresse.rue)}<br>${esc(ENTREPRISE.adresse.codePostal)} ${esc(ENTREPRISE.adresse.ville)}, ${esc(ENTREPRISE.adresse.pays)}</p>
<p>Téléphone : <a href="tel:${esc(ENTREPRISE.telephoneInternational)}">${esc(ENTREPRISE.telephone)}</a><br>Horaires : ${esc(ENTREPRISE.horaires.libelle)}</p>
${ENTREPRISE.ficheGoogle ? `<p><a href="${esc(ENTREPRISE.ficheGoogle)}" rel="noopener" target="_blank">Voir sur Google Maps</a></p>` : ''}
<h2>Selon votre demande</h2>
<ul>
<li><strong>Une question avant de vous inscrire</strong> : la réponse est peut-être déjà dans les <a href="/faq/">questions fréquentes</a> ou sur la page des <a href="/tarifs/">tarifs</a>. Sinon, écrivez-nous.</li>
<li><strong>Vous avez un compte</strong> : ouvrez un ticket depuis votre espace (menu <em>Tickets</em>) ; il garde l'historique de l'échange et l'agent de comptoir y répond tout de suite sur les questions courantes.</li>
<li><strong>Vos données personnelles</strong> (accès, rectification, suppression du compte) : écrivez à l'adresse ci-dessus ; la demande est traitée sans condition, comme le dit la <a href="/confidentialite">politique de confidentialité</a>.</li>
<li><strong>Affiliation</strong> : le programme et l'inscription sont sur la page <a href="/affiliation">affiliation</a> ; pour un versement, écrivez-nous depuis l'adresse de votre compte affilié.</li>
<li><strong>Partenariat, presse, fournisseur ou plateforme qui souhaite être relié</strong> : même adresse, en précisant l'objet.</li>
</ul>
<h2>Pour aller plus vite</h2>
<p>Indiquez l'adresse email de votre compte, la page concernée et, pour un produit, le lien de la fiche d'origine. Ne nous envoyez jamais vos mots de passe ni vos clés d'API : nous n'en avons pas besoin et ne vous les demanderons pas.</p>`,
  })
}

function pageCookies() {
  return pageSimple({
    url: '/cookies/',
    nom: 'Cookies',
    title: `Cookies et traceurs | ${NOM}`,
    description: `Ce que ${NOM} dépose dans votre navigateur : aucun traceur publicitaire ni mesure d'audience, un jeton de session, et les cookies de Stripe au paiement.`,
    corps: `<h1>Cookies et traceurs</h1>
<p class="lede">En bref : ${NOM} ne dépose aucun cookie publicitaire et ne mesure pas l'audience.</p>
<h2>Ce qui est enregistré dans votre navigateur</h2>
<div class="table"><table><thead><tr><th>Quoi</th><th>Où</th><th>Pourquoi</th><th>Durée</th></tr></thead><tbody>
<tr><td>Jeton de session</td><td>Stockage local du navigateur (pas un cookie)</td><td>Vous garder connecté à votre espace</td><td>Jusqu'à la déconnexion</td></tr>
<tr><td>Préférences d'affichage (thème du tableau de bord, vue choisie, nouveautés déjà vues)</td><td>Stockage local du navigateur</td><td>Retrouver l'application comme vous l'avez laissée</td><td>Jusqu'à ce que vous les changiez</td></tr>
<tr><td>Service worker</td><td>Navigateur</td><td>Permettre d'installer le site sur un téléphone ; il ne met rien en cache et ne lit rien</td><td>Jusqu'à la désinstallation</td></tr>
<tr><td>Code d'affiliation</td><td>Stockage local du navigateur</td><td>Si vous arrivez par le lien d'un affilié (?parrain=…), retenir ce code pour lui attribuer votre inscription ; la visite est comptée, sans aucune donnée vous concernant</td><td>30 jours, ou jusqu'à l'inscription</td></tr>
<tr><td>Cookies de Stripe</td><td>Page de recharge des drops uniquement</td><td>Paiement sécurisé et lutte contre la fraude, déposés par Stripe, notre prestataire de paiement</td><td>Fixée par Stripe</td></tr>
</tbody></table></div>
<p>Ces éléments servent au fonctionnement du service ou, pour le code d'affiliation, à attribuer une inscription ; aucun ne vous suit sur d'autres sites et aucun n'est lu par un tiers à des fins publicitaires.</p>
<h2>Ce que nous ne faisons pas</h2>
<ul>
<li>Pas de Google Analytics, pas de pixel Meta ou TikTok, pas de mesure d'audience.</li>
<li>Pas de profilage ni de revente de données.</li>
</ul>
<p>Si un outil de mesure ou de publicité est un jour ajouté, il ne se déclenchera qu'après votre accord, donné dans un bandeau qui permettra de refuser aussi simplement que d'accepter, et cette page sera mise à jour avant.</p>
<h2>Vos choix</h2>
<p>Vous pouvez effacer à tout moment les données du site depuis les réglages de votre navigateur (cela vous déconnecte). Pour le reste de vos données : <a href="/confidentialite">politique de confidentialité</a>, ou <a href="/contact/">écrivez-nous</a>.</p>
<p class="fine">Dernière mise à jour : ${dateFr(TODAY)}.</p>`,
  })
}

function pageCgu() {
  return pageSimple({
    url: '/cgu/',
    nom: "Conditions générales d'utilisation",
    title: `Conditions générales d'utilisation | ${NOM}`,
    description: `Les règles d'utilisation de ${NOM} : compte, drops et prix à l'acte, responsabilité du vendeur, plateformes tierces, données, résiliation.`,
    corps: `<h1>Conditions générales d'utilisation</h1>
<p class="lede">Elles s'appliquent au site www.drop-shipper.fr, à son application, à l'extension Chrome et à l'application de bureau ${NOM}. Créer un compte vaut acceptation.</p>
<h2>1. Le service</h2>
<p>${NOM} est un logiciel en ligne d'aide à la vente : import de fiches produit depuis des boutiques tierces, réécriture des annonces par intelligence artificielle, photos filigranées, publication vers des boutiques et des places de marché, boutiques en ligne, analyses de marché et agents d'assistance. Le détail est sur les pages <a href="/fonctions/annonces-ia/">fonctions</a> et <a href="/tarifs/">tarifs</a>.</p>
<p>${NOM} n'est ni vendeur, ni fournisseur, ni place de marché : il ne vend rien aux acheteurs finaux. Le vendeur qui l'utilise reste seul responsable de ses ventes.</p>
<h2>2. Le compte</h2>
<p>L'inscription demande une adresse email valide, vérifiée par un lien, ou une connexion Google. Vous êtes responsable de la confidentialité de votre mot de passe et des actions faites depuis votre compte. Le compte est personnel.</p>
<h2>3. Les drops et les prix</h2>
<ul>
<li>Le service se paie à l'acte, en drops : 1 drop vaut 0,01 €. Il n'y a pas d'abonnement. 120 drops sont offerts à l'inscription.</li>
<li>Le prix de chaque action est affiché sur la page des <a href="/tarifs/">tarifs</a> et dans l'application avant qu'elle ne soit lancée. Les drops sont prépayés par recharge, réglée par carte via Stripe.</li>
<li>Quand une action échoue de notre fait, ou quand l'IA refuse de réécrire une fiche sans matière, les drops de cette action sont rendus.</li>
<li>Les campagnes publicitaires créées depuis ${NOM} le sont en pause : le budget publicitaire est payé directement par le vendeur à la régie, et rien n'est dépensé sans son action.</li>
</ul>
<h2>4. Votre responsabilité de vendeur</h2>
<ul>
<li>Vous vous assurez d'avoir le droit de vendre chaque produit : conformité, sécurité, marques, droits sur les images, et autorisation du fournisseur de revendre ou de dropshipper.</li>
<li>Les textes rédigés par l'IA sont des propositions : relisez-les avant publication. Vous restez responsable de ce que vous publiez, y compris des caractéristiques, prix et délais annoncés.</li>
<li>Vous respectez les conditions de chaque plateforme où vous publiez, et les obligations du commerce en ligne (information de l'acheteur, garanties, droit de rétractation, fiscalité, statut de vendeur professionnel le cas échéant).</li>
</ul>
<h2>5. Les plateformes tierces</h2>
<p>Vous reliez vous-même vos comptes de places de marché, de boutique et de réseaux sociaux. ${NOM} ne reçoit jamais vos mots de passe de ces plateformes : la liaison passe par leur autorisation officielle ou par les clés que vous saisissez. Sur Vinted, Leboncoin et Facebook Marketplace, l'extension remplit le formulaire dans votre navigateur et c'est vous qui cliquez sur « Publier ». Le mode automatique de l'application de bureau ne publie qu'avec votre accord explicite, dans votre propre session, avec des plafonds et un arrêt au premier blocage ; il comporte un risque de suspension de compte qui vous est présenté avant activation.</p>
<p>Ces plateformes peuvent changer leurs règles ou leurs interfaces sans préavis : ${NOM} ne peut garantir qu'une publication y sera toujours possible.</p>
<h2>6. Usages interdits</h2>
<p>Il est interdit d'utiliser ${NOM} pour vendre des produits illicites, contrefaits ou dangereux, pour publier des contenus trompeurs, pour contourner les protections d'un site tiers, ou pour tenter d'accéder aux données d'un autre compte. Un compte qui le fait peut être suspendu.</p>
<h2>7. Disponibilité</h2>
<p>Le service est fourni en l'état, avec le soin raisonnable d'un éditeur de logiciel. Des interruptions peuvent survenir, notamment lors des mises à jour. Les données sont sauvegardées chaque jour.</p>
<h2>8. Données personnelles</h2>
<p>Ce que nous enregistrons, pourquoi et chez qui : <a href="/confidentialite">politique de confidentialité</a> et <a href="/cookies/">cookies</a>.</p>
<h2 id="affiliation">9. Programme d'affiliation</h2>
<ul>
<li>Le compte affilié est distinct d'un compte vendeur. Il s'ouvre sur la page <a href="/affiliation">affiliation</a> ; l'accès se fait avec l'adresse email et un code reçu par mail.</li>
<li>Un vendeur devient filleul d'un affilié quand il crée son compte dans les 30 jours suivant sa visite par le lien de l'affilié. Un compte existant n'est pas rattaché après coup, et on ne peut pas être son propre filleul.</li>
<li>L'affilié touche 10 % des montants payés par ses filleuls pour leurs recharges de drops, par carte ou via Shopify, aussi longtemps que leur compte existe. Les drops offerts ne donnent pas lieu à commission.</li>
<li>Les commissions sont visibles dans l'espace affilié et versées en euros par virement bancaire, une fois par mois, dès que 50 € sont dus ; en dessous, la somme reste acquise et s'ajoute au mois suivant. L'affilié saisit son IBAN dans son espace et, s'il agit à titre professionnel, fournit une facture ; il déclare lui-même ces revenus.</li>
<li>Sont interdits : les envois non sollicités, les publicités payantes sur le nom DropShipper IA, les promesses trompeuses sur le service, et toute inscription fictive. Une fraude entraîne la fermeture du compte affilié et l'annulation des commissions concernées.</li>
</ul>
<h2>10. Fin du compte</h2>
<p>Vous pouvez demander la suppression de votre compte à tout moment, sans condition, en <a href="/contact/">nous écrivant</a> ; elle efface vos annonces, leurs photos et vos liaisons.</p>
<h2>11. Modifications et droit applicable</h2>
<p>Ces conditions peuvent évoluer ; la date de mise à jour figure ci-dessous et un changement important est annoncé par email aux titulaires d'un compte. Elles sont soumises au droit français.</p>
<p class="fine">Dernière mise à jour : ${dateFr(TODAY)}. Une question : <a href="mailto:${EMAIL}">${EMAIL}</a>.</p>`,
  })
}

/** Publiée seulement quand l'éditeur est entièrement identifié (scripts/editeur.cjs). */
function pageMentionsLegales() {
  if (manquants().length) return null
  return pageSimple({
    url: '/mentions-legales/',
    nom: 'Mentions légales',
    title: `Mentions légales | ${NOM}`,
    description: `Éditeur, directeur de la publication et hébergeurs du site ${NOM}.`,
    corps: `<h1>Mentions légales</h1>
<h2>Éditeur du site</h2>
<table><tbody>${lignesConnues().map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
<h2>Hébergement</h2>
<ul>
<li>Le site : Vercel Inc., États-Unis — vercel.com</li>
<li>L'API et la base de données : Railway Corporation, États-Unis — railway.com</li>
</ul>
<p>Données personnelles : <a href="/confidentialite">politique de confidentialité</a>. Conditions : <a href="/cgu/">CGU</a>.</p>`,
  })
}

/* ------------------------------------------------------------------ */
/* Contrôles et écriture                                               */
/* ------------------------------------------------------------------ */

/** Ce qu'un article doit respecter avant d'être publié. Renvoie la liste des fautes. */
function verifier(tous) {
  const fautes = []
  const slugs = new Set()
  for (const a of tous) {
    const f = (msg) => fautes.push(`${a.slug} : ${msg}`)
    for (const champ of ['titre', 'description', 'chapo', 'date']) if (!a[champ]) f(`champ « ${champ} » absent`)
    if (slugs.has(a.slug)) f('adresse en double')
    slugs.add(a.slug)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)) f('adresse hors [a-z0-9-]')
    if (a.date && !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) f('date hors AAAA-MM-JJ')
    if (a.description && (a.description.length < 110 || a.description.length > 165)) f(`description de ${a.description.length} caractères (110 à 165)`)
    const titre = a.titreSeo || a.titre || ''
    if (titre.length > 65) f(`titre SEO de ${titre.length} caractères (65 au plus)`)
    const n = mots(a.markdown)
    if (n < 900) f(`${n} mots (900 au moins)`)
    if (!a.markdown.includes('](/tarifs/)')) f('aucun lien vers /tarifs/')
    if (!/\]\(\/fonctions\/[a-z-]+\/\)/.test(a.markdown)) f('aucun lien vers une page /fonctions/')
    // Règle de Max : ni prix d'achat ni lien fournisseur sur une page publique.
    if (/prix d['’]achat\s*:?\s*\d/i.test(a.markdown)) f("prix d'achat chiffré")
    for (const [, href] of a.markdown.matchAll(/\]\((https?:[^)\s]+)\)/g)) {
      if (/aliexpress|temu|alibaba|cjdropshipping|bigbuy|shein|dhgate|banggood|joybuy/i.test(href)) f(`lien fournisseur : ${href}`)
    }
  }
  return fautes
}

function ecrire(page) {
  const dossier = path.join(DIST, page.url)
  fs.mkdirSync(dossier, { recursive: true })
  fs.writeFileSync(path.join(dossier, 'index.html'), page.html)
}

/** Ajoute nos adresses au sitemap des pages (sitemap-pages.xml après build-geo, sitemap.xml sinon). */
function completerSitemap(urls) {
  const fichier = ['sitemap-pages.xml', 'sitemap.xml'].map((f) => path.join(DIST, f)).find((f) => fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes('<urlset'))
  if (!fichier) throw new Error('aucun sitemap de pages dans dist/ — lancez build-seo.cjs et build-geo.cjs avant')
  let xml = fs.readFileSync(fichier, 'utf8')
  const lignes = urls
    .filter((u) => !xml.includes(`<loc>${SITE}${u.url}</loc>`))
    .map((u) => `  <url><loc>${SITE}${u.url}</loc><lastmod>${u.lastmod || TODAY}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`)
  if (lignes.length) xml = xml.replace('</urlset>', () => `${lignes.join('\n')}\n</urlset>`)
  fs.writeFileSync(fichier, xml)
  return { fichier: path.basename(fichier), ajoutees: lignes.length }
}

function main() {
  const tous = articles()
  const fautes = verifier(tous)
  if (process.argv.includes('--verifier')) {
    for (const a of tous) console.log(`  ${a.url} — ${mots(a.markdown)} mots`)
    if (fautes.length) {
      console.error(fautes.map((f) => `✗ ${f}`).join('\n'))
      process.exit(1)
    }
    console.log(`blog : ${tous.length} articles conformes`)
    return
  }
  if (fautes.length) {
    console.error(`blog refusé :\n${fautes.map((f) => `  ✗ ${f}`).join('\n')}`)
    process.exit(1)
  }
  if (!fs.existsSync(DIST)) {
    console.error(`dist/ absent — lancez vite build avant ${path.basename(__filename)}`)
    process.exit(1)
  }

  const mentions = pageMentionsLegales()
  const pages = [pageIndex(tous), ...tous.map((a) => pageArticle(a, tous)), pageContact(), pageCgu(), pageCookies(), ...(mentions ? [mentions] : [])]
  pages.forEach(ecrire)

  const sitemap = completerSitemap([
    { url: '/blog/', freq: 'weekly', priority: '0.8', lastmod: tous[0]?.maj || tous[0]?.date },
    ...tous.map((a) => ({ url: a.url, freq: 'monthly', priority: '0.7', lastmod: a.maj || a.date })),
    { url: '/contact/', freq: 'yearly', priority: '0.5' },
    { url: '/cgu/', freq: 'yearly', priority: '0.3' },
    { url: '/cookies/', freq: 'yearly', priority: '0.3' },
    ...(mentions ? [{ url: '/mentions-legales/', freq: 'yearly', priority: '0.3' }] : []),
  ])

  console.log(`blog : ${tous.length} articles, ${pages.length} pages — ${pages.map((p) => p.url).join(' ')}`)
  console.log(`${sitemap.fichier} : ${sitemap.ajoutees} adresses ajoutées`)
  if (!mentions) console.log(`mentions légales non publiées : champs à remplir dans scripts/editeur.cjs — ${manquants().join(', ')}`)
}

module.exports = { articles, markdown, verifier }

if (require.main === module) main()
