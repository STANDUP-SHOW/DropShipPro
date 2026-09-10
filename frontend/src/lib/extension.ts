/**
 * Le lien de la fiche Chrome Web Store de l'extension.
 *
 * Source unique : la page Extension, l'alerte de version et tout futur renvoi
 * pointent ici. Depuis que l'extension est publiée en Public, c'est la voie
 * d'installation officielle — un clic, et Chrome la met à jour tout seul. On ne
 * recopie donc plus l'adresse à trois endroits qui divergeraient.
 *
 * Vide = pas encore publiée : les composants retombent alors sur l'installation
 * manuelle (mode développeur). Aujourd'hui renseigné.
 */
export const CHROME_STORE_URL =
  'https://chromewebstore.google.com/detail/dmhhfboiialjghjkjhfnipjafffpodlk'
