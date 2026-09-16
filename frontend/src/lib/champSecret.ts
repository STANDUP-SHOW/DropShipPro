/**
 * Ce qu'il faut poser sur un champ d'identifiant pour que Chrome n'y verse pas
 * le mot de passe du vendeur.
 *
 * **La panne, constatée le 15/09/2026 dans le vrai Chrome de Max.** Le
 * formulaire AliExpress s'ouvre, et sans qu'il touche à rien :
 *
 *   App Key    : maxmartinel34@gmail.com
 *   App Secret : ••••••••••••••
 *
 * Son adresse et son **mot de passe personnel**, versés par le gestionnaire de
 * mots de passe de Chrome. Un clic sur « Relier » et le mot de passe partait
 * s'enregistrer chez nous comme secret d'API — inutilisable pour AliExpress, et
 * stocké là où il n'a rien à faire.
 *
 * `autoComplete="off"` était déjà posé sur ce champ. **Chrome l'ignore**, et
 * c'est documenté : sur ce qu'il prend pour un formulaire de connexion, son
 * gestionnaire passe outre. Et il le prend pour un formulaire de connexion sur
 * une signature très simple — un champ texte suivi d'un champ
 * `type="password"`. C'est exactement la forme de tous nos formulaires
 * d'identifiants : clé puis secret, adresse puis jeton, App Key puis App Secret.
 *
 * Trois protections, parce qu'aucune ne suffit seule :
 *
 * 1. **`autoComplete="new-password"`** — et non `off`. C'est la seule valeur
 *    que le gestionnaire de Chrome respecte : elle dit « on crée un mot de
 *    passe ici », donc il n'y verse jamais un identifiant mémorisé. Posée sur
 *    les champs texte aussi : c'est la PAIRE qui déclenche l'heuristique, la
 *    protéger d'un seul côté ne sert à rien.
 * 2. **Les marqueurs des autres gestionnaires** (1Password, LastPass,
 *    Bitwarden, Dashlane). Ils ont chacun le leur et n'écoutent pas
 *    `autocomplete`. Un vendeur sur trois en utilise un.
 * **Ce qu'on a essayé et retiré : le `readOnly` levé au focus.** L'idée
 * paraissait solide — un champ en lecture seule ne peut être rempli par
 * personne au chargement, et c'est au chargement que le remplissage automatique
 * frappe ; il redevenait normal dès que le vendeur le visait. En pratique,
 * **le champ restait en lecture seule** : levé impérativement dans `onFocus`,
 * l'attribut revenait au premier rendu suivant, et plus rien ne pouvait y être
 * tapé ni collé. Constaté le 16/09/2026 sur la clé BigBuy — « j'ai recollé la
 * clé, toujours rien » — et la clé en base n'avait effectivement pas bougé
 * d'une seconde.
 *
 * La leçon vaut plus que le détail : **un filet de sécurité qui bloque le
 * chemin légitime coûte plus cher que le risque qu'il écarte.** Ici il
 * transformait un remplissage indésirable, visible et corrigeable, en un
 * formulaire muet dont personne ne comprenait le silence. Les deux protections
 * restantes suffisent, et elles ont été vérifiées dans le vrai Chrome : les
 * champs AliExpress s'ouvrent vides.
 */
export const PROPS_SANS_REMPLISSAGE = {
  autoComplete: 'new-password' as const,
  spellCheck: false,
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
  'data-form-type': 'other',
}

/**
 * Un nom de champ qu'aucun gestionnaire ne prendra pour un identifiant.
 *
 * `name="apiKey"` ou `name="clientKey"` ressemblent assez à `username` pour
 * que l'heuristique s'y accroche. Le nom porté par le DOM n'a d'importance que
 * pour `FormData` : on le préfixe, et les lectures visent ce nom préfixé.
 */
export function nomSansRemplissage(cle: string): string {
  return `dsp-${cle}`
}
