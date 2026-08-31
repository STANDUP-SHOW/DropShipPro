import { PlatformLogo } from './PlatformLogo'

/**
 * La marque d'une destination, en petit.
 *
 * **Ce composant dessinait un monogramme, et jamais le vrai logo** — la note
 * d'origine invoquait la question de marque. Elle se répond : afficher le logo
 * d'une place de marché pour désigner cette place de marché, dans un outil qui
 * sert à y publier, est un usage nominatif. Ce que le droit des marques
 * interdit, c'est de laisser croire à une affiliation ; une liste de
 * destinations ne le fait pas.
 *
 * Le vrai motif était plus prosaïque : nous n'avions pas les fichiers. L'icône
 * que chaque site publie lui-même les remplace.
 *
 * Il ne reste ici qu'une différence de forme avec `PlatformLogo` — un coin
 * moins arrondi, parce qu'il vit dans des listes serrées. Dupliquer la
 * mécanique de repli pour ça aurait fait deux endroits à corriger.
 */
export function PlatformBadge({
  label,
  color,
  size = 28,
  domain,
  id,
}: {
  label: string
  color: string
  size?: number
  domain?: string | null
  id?: string
}) {
  return <PlatformLogo id={id} label={label} color={color} size={size} domain={domain} arrondi="md" />
}
