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
  /** Adresse postale du siège. */
  adresse: null,
  /** Personne responsable de la publication (en général le dirigeant). */
  directeurPublication: null,
  /** Fondateur, tel qu'il veut apparaître sur /a-propos/. */
  fondateur: null,
  /** Date de création de l'entreprise, AAAA-MM-JJ. */
  dateCreation: null,
  telephone: null,
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
    ['email', 'Contact'],
  ]
  return libelles.filter(([k]) => EDITEUR[k]).map(([k, label]) => [label, EDITEUR[k]])
}

module.exports = { EDITEUR, OBLIGATOIRES, manquants, lignesConnues }
