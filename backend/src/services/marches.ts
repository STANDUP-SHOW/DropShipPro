/**
 * Charge les connecteurs de places de marché à autorisation (TikTok Shop,
 * Amazon, Allegro) : chacun s'enregistre au chargement de son module. Importer
 * ce fichier, c'est être sûr qu'aucun n'a été oublié par le diffuseur ou par
 * la page Réglages.
 */
import './tiktokShop.js'
import './amazon.js'
import './allegro.js'

export { connecteurMarche, connecteursMarche, retourMarche, type ConnecteurMarche } from './marchesApi.js'
