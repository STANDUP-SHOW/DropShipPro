/**
 * Reprend la session ouverte sur drop-shipper.fr.
 *
 * **Le vendeur se connectait deux fois.** Une fois sur le site, une fois dans
 * l'extension, avec le même mot de passe, dans le même navigateur, à deux
 * minutes d'intervalle. Rien ne l'expliquait, et c'est le premier écran qu'il
 * voit : beaucoup n'allaient pas plus loin.
 *
 * Ce script tourne uniquement sur l'origine de l'application, lit le jeton que
 * celle-ci a déjà obtenu, et le passe au service worker. L'extension se
 * retrouve connectée sans une seule saisie.
 *
 * **Ce qu'il ne fait pas, et c'est délibéré :** il ne lit ni l'adresse
 * électronique, ni le mot de passe, ni quoi que ce soit d'autre du stockage
 * local. Un jeton de session est ce qu'il faut pour appeler l'API au nom du
 * vendeur, et rien de plus — c'est exactement ce que l'extension aurait obtenu
 * en lui redemandant de se connecter.
 */
;(() => {
  /** La clé sous laquelle l'application range son jeton. */
  const CLE = 'droppost_token'

  function lireJeton() {
    try {
      const jeton = localStorage.getItem(CLE)
      return typeof jeton === 'string' && jeton.length > 20 ? jeton : null
    } catch {
      // Stockage bloqué, navigation privée : on ne reprend simplement rien.
      return null
    }
  }

  function proposer() {
    const jeton = lireJeton()
    if (!jeton) return

    /*
     * Envoyé à chaque passage, pas seulement au premier.
     *
     * Le vendeur peut se déconnecter puis se reconnecter sous un autre compte :
     * garder le premier jeton ferait travailler l'extension pour quelqu'un
     * d'autre. Le service worker compare et ne remplace que si ça a changé.
     */
    chrome.runtime.sendMessage({ type: 'dsp-session-offerte', jeton }, () => {
      // Le service worker peut dormir : son absence de réponse n'est pas une
      // erreur, et la lever remplirait la console de l'application.
      void chrome.runtime.lastError
    })
  }

  proposer()

  /*
   * Et après la connexion, sans recharger la page.
   *
   * L'application est une application d'une seule page : le vendeur se connecte
   * et rien ne se recharge. Sans cette écoute, l'extension ne verrait le jeton
   * qu'à la visite suivante — c'est-à-dire au moment précis où il vient de se
   * connecter et où elle lui redemanderait de le faire.
   */
  window.addEventListener('storage', (e) => {
    if (e.key === CLE) proposer()
  })

  // `storage` ne se déclenche pas dans l'onglet qui écrit. Un regard toutes les
  // deux secondes pendant la première minute couvre le cas de la connexion.
  let restants = 30
  const minuteur = setInterval(() => {
    if (--restants <= 0) return clearInterval(minuteur)
    proposer()
  }, 2000)
})()
