/**
 * L'éditeur du site : les faits que seul Max peut donner.
 *
 * Tant qu'un champ vaut `null`, il n'est affiché nulle part : on ne publie
 * jamais une valeur vraisemblable à la place d'une vraie. La page
 * /mentions-legales/ n'est engendrée qu'une fois les champs OBLIGATOIRES remplis
 * (loi pour la confiance dans l'économie numérique, art. 6-III) ; le bloc
 * « L'éditeur » de /a-propos/ montre ce qui est connu, ligne par ligne.
 *
 * Lu par build-blog.cjs (mentions légales) et build-geo.cjs (à propos).
 */
const ENTREPRISE = require('../src/data/entreprise.json')
const A = ENTREPRISE.adresse

const EDITEUR = {
  /** Nom de la société, ou nom et prénom pour un entrepreneur individuel. */
  raisonSociale: null,
  /** SAS, SARL, EURL, entreprise individuelle (micro-entreprise)… */
  formeJuridique: null,
  /** Capital social, pour une société (« 1 000 € »). */
  capital: null,
  siret: null,
  /** « RCS Montpellier 123 456 789 », ou « RNE » pour un entrepreneur individuel. */
  immatriculation: null,
  /** Numéro de TVA intracommunautaire, s'il existe. */
  tva: null,
  /** Adresse postale du siège — src/data/entreprise.json, la même que la fiche Google. */
  adresse: `${A.rue}, ${A.codePostal} ${A.ville}, ${A.pays}`,
  /** Personne responsable de la publication (en général le dirigeant). */
  directeurPublication: ENTREPRISE.dirigeant,
  /** Fondateur, tel qu'il veut apparaître sur /a-propos/. */
  fondateur: ENTREPRISE.dirigeant,
  /** Date de création de l'entreprise, AAAA-MM-JJ. */
  dateCreation: null,
  telephone: ENTREPRISE.telephone,
  horaires: ENTREPRISE.horaires.libelle,
  email: 'contact@drop-shipper.fr',
}

/** Sans ces champs, les mentions légales seraient incomplètes : la page n'est pas publiée. */
const OBLIGATOIRES = ['raisonSociale', 'adresse', 'siret', 'directeurPublication']

const manquants = () => OBLIGATOIRES.filter((k) => !EDITEUR[k])

/** Les lignes connues, dans l'ordre d'affichage. */
function lignesConnues() {
  const libelles = [
    ['raisonSociale', 'Éditeur'],
    ['formeJuridique', 'Forme juridique'],
    ['capital', 'Capital social'],
    ['siret', 'SIRET'],
    ['immatriculation', 'Immatriculation'],
    ['tva', 'TVA intracommunautaire'],
    ['adresse', 'Siège'],
    ['fondateur', 'Fondateur'],
    ['dateCreation', 'Création'],
    ['directeurPublication', 'Directeur de la publication'],
    ['telephone', 'Téléphone'],
    ['horaires', 'Horaires'],
    ['email', 'Contact'],
  ]
  return libelles.filter(([k]) => EDITEUR[k]).map(([k, label]) => [label, EDITEUR[k]])
}

/** L'adresse en schema.org, la même que la fiche Google. */
function adresseLd() {
  return {
    '@type': 'PostalAddress',
    streetAddress: A.rue,
    postalCode: A.codePostal,
    addressLocality: A.ville,
    addressRegion: A.region,
    addressCountry: A.codePays,
  }
}

/**
 * L'établissement, pour le « local pack » de Google (la carte) : nom, adresse,
 * téléphone et horaires identiques à la fiche Google Business. Aucune note
 * (aggregateRating) : on n'en invente jamais, et Google ne lit pas une note
 * qu'une entreprise publie sur elle-même. Pas de coordonnées GPS non plus tant
 * qu'elles ne viennent pas de la fiche Google : une position approchée serait fausse.
 */
function etablissementLd(site) {
  const h = ENTREPRISE.horaires
  return {
    '@type': 'ProfessionalService',
    '@id': `${site}/#etablissement`,
    name: ENTREPRISE.nom,
    url: `${site}/`,
    image: `${site}/images/og-dropshipper-1200x630.png`,
    logo: `${site}/marque/dropshipper-icone.png`,
    telephone: ENTREPRISE.telephoneInternational,
    email: EDITEUR.email,
    address: adresseLd(),
    founder: { '@type': 'Person', name: ENTREPRISE.dirigeant },
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: h.jours, opens: h.ouverture, closes: h.fermeture }],
    areaServed: ['FR', 'BE', 'CH', 'LU', 'CA'],
    parentOrganization: { '@id': `${site}/#organisation` },
    ...(ENTREPRISE.ficheGoogle ? { hasMap: ENTREPRISE.ficheGoogle } : {}),
  }
}

module.exports = { adresseLd, etablissementLd, ENTREPRISE, EDITEUR, OBLIGATOIRES, manquants, lignesConnues }
