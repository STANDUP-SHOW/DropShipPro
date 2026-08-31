import { assetUrl } from '../lib/api'

/**
 * Ce que Google montrera de cette annonce.
 *
 * Le titre et la méta-description sont écrits en aveugle : deux champs de texte
 * dans une interface sombre, sans rien qui dise ce qu'ils deviennent. Or Google
 * ne montre pas ce qu'on lui donne — il coupe. Un titre de cent trente
 * caractères, excellent pour Amazon, arrive tronqué au milieu d'un mot ; une
 * description qui commence par « Découvrez notre… » perd ses deux seuls
 * arguments après la coupe.
 *
 * D'où ce bloc, et d'où son fond blanc : il n'est pas décoratif. Une couleur
 * plus proche de celle du site montrerait un aperçu qui ne ressemble pas au
 * résultat, ce qui vaut moins que pas d'aperçu du tout.
 *
 * **Ce n'est pas une garantie.** Google réécrit les titres qu'il juge mauvais
 * dans à peu près la moitié des cas, et fabrique souvent sa propre description à
 * partir de la page. L'aperçu montre ce qu'on lui propose, pas ce qu'il
 * affichera. Le dire ici, une fois, évite de le laisser croire.
 */

/*
 * Les bornes d'affichage de Google.
 *
 * Elles sont en pixels, pas en caractères — un titre en majuscules est coupé
 * plus tôt que le même en minuscules. On approche par le nombre de caractères,
 * parce que c'est ce qu'on peut compter honnêtement et que la marge d'erreur
 * (deux ou trois caractères) ne change aucune décision de rédaction.
 */
const TITRE_MAX = 60
const DESCRIPTION_MAX = 155

/** Coupe au dernier mot entier, comme Google, plutôt qu'au caractère. */
function couper(texte: string, max: number): { visible: string; coupe: string } {
  const propre = texte.replace(/\s+/g, ' ').trim()
  if (propre.length <= max) return { visible: propre, coupe: '' }
  const tranche = propre.slice(0, max)
  const espace = tranche.lastIndexOf(' ')
  const fin = espace > max * 0.6 ? espace : max
  return { visible: propre.slice(0, fin), coupe: propre.slice(fin) }
}

/** L'adresse sous laquelle la fiche vivra : la même règle que côté serveur. */
function handleDe(titre: string, max = 70): string {
  const base = titre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (base.length <= max) return base
  const tranche = base.slice(0, max)
  const dernier = tranche.lastIndexOf('-')
  return (dernier > max / 2 ? tranche.slice(0, dernier) : tranche).replace(/-+$/, '')
}

/** Le texte au-delà de la coupe, grisé : on voit ce qui est perdu. */
function Tronque({ visible, coupe }: { visible: string; coupe: string }) {
  return (
    <>
      {visible}
      {coupe ? <span className="text-[#bdc1c6]">{`…${coupe}`}</span> : ''}
    </>
  )
}

/** Un compteur qui dit ce qui passe, et ce qui ne passe pas. */
function Compteur({ label, longueur, max }: { label: string; longueur: number; max: number }) {
  const depasse = longueur > max
  return (
    <span className={depasse ? 'text-amber-300' : 'text-gray-500'}>
      {depasse
        ? `${label} : ${longueur} caractères, ${longueur - max} au-delà de la coupe`
        : `${label} : ${longueur} / ${max} caractères`}
    </span>
  )
}

export interface GooglePreviewProps {
  title: string
  description: string
  /** La méta-description, quand elle est écrite : c'est elle que Google lit. */
  metaTitle?: string | null
  metaDescription?: string | null
  price: number
  currency: string
  image?: string | null
  /** Le nom de la boutique, quand il y en a une. */
  boutique?: string | null
  /** Le chemin de catégorie, pour le fil d'Ariane. */
  categorie?: string | null
}

export function GooglePreview({
  title,
  description,
  metaTitle,
  metaDescription,
  price,
  currency,
  image,
  boutique,
  categorie,
}: GooglePreviewProps) {
  const titreSource = (metaTitle || title || '').trim()
  const descriptionSource = (metaDescription || description || '').trim()

  const titre = couper(titreSource, TITRE_MAX)
  const resume = couper(descriptionSource, DESCRIPTION_MAX)

  const domaine = boutique
    ? `${handleDe(boutique, 40) || 'votre-boutique'}.fr`
    : 'votre-boutique.fr'
  const fil = [domaine, ...(categorie ? categorie.split('>').map((s) => s.trim()) : [])]
    .filter(Boolean)
    .slice(0, 3)

  const prix = price > 0 ? `${price.toFixed(2)} ${currency}` : null

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 backdrop-blur-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">Aperçu Google</h2>
        <p className="text-xs text-gray-500">
          Google réécrit environ un titre sur deux : ceci est ce qu'on lui propose.
        </p>
      </div>

      {/* Fond blanc, police système : un aperçu qui ne ressemble pas au résultat
          vaut moins que pas d'aperçu du tout. */}
      <div className="mt-4 rounded-xl bg-white p-5 font-[Arial,sans-serif] text-[#202124]">
        {/* ---------- Le résultat de recherche ---------- */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f1f3f4] text-[11px] font-bold text-[#5f6368]"
          >
            {(boutique || 'B').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] text-[#202124]">{boutique || 'Votre boutique'}</div>
            <div className="truncate text-[12px] text-[#4d5156]">{fil.join(' › ')}</div>
          </div>
        </div>

        <h3 className="mt-1.5 text-[20px] leading-[1.3] text-[#1a0dab]">
          {titreSource ? (
            <Tronque visible={titre.visible} coupe={titre.coupe} />
          ) : (
            <span className="text-[#bdc1c6]">Sans titre</span>
          )}
        </h3>

        <p className="mt-1 text-[14px] leading-[1.58] text-[#4d5156]">
          {descriptionSource ? (
            <Tronque visible={resume.visible} coupe={resume.coupe} />
          ) : (
            <span className="text-[#bdc1c6]">
              Aucune méta-description : Google fabriquera la sienne à partir de la page.
            </span>
          )}
        </p>

        {prix ? (
          <p className="mt-1 text-[14px] text-[#4d5156]">
            <span className="font-medium text-[#202124]">{prix}</span>
            <span> · En stock</span>
          </p>
        ) : null}

        {/* ---------- La fiche Shopping ---------- */}
        <div className="mt-5 border-t border-[#dadce0] pt-4">
          <p className="mb-3 text-[12px] uppercase tracking-wide text-[#5f6368]">Fiche Shopping</p>
          <div className="flex max-w-[260px] gap-3 rounded-lg border border-[#dadce0] p-3">
            {image ? (
              <img
                src={assetUrl(image)}
                alt=""
                className="h-20 w-20 shrink-0 rounded object-contain"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded bg-[#f1f3f4] text-[11px] text-[#5f6368]">
                Sans photo
              </div>
            )}
            <div className="min-w-0">
              <p className="line-clamp-3 text-[13px] leading-[1.35] text-[#202124]">
                {titreSource || 'Sans titre'}
              </p>
              <p className="mt-1 text-[14px] font-medium text-[#202124]">{prix ?? 'Sans prix'}</p>
              <p className="truncate text-[12px] text-[#5f6368]">{boutique || 'Votre boutique'}</p>
            </div>
          </div>
        </div>
      </div>

      {/*
        Les compteurs sous l'aperçu et pas dedans : dans le cadre blanc, ils
        feraient partie du résultat simulé, et on ne saurait plus ce que Google
        montre de ce que nous ajoutons.
      */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <Compteur label="Titre" longueur={titreSource.length} max={TITRE_MAX} />
        <Compteur label="Description" longueur={descriptionSource.length} max={DESCRIPTION_MAX} />
        {!metaTitle && titreSource ? (
          <span className="text-gray-500">Titre repris de l'annonce, faute de titre SEO</span>
        ) : null}
        {!metaDescription && descriptionSource ? (
          <span className="text-gray-500">Description reprise de l'annonce</span>
        ) : null}
      </div>

      {prix ? (
        <p className="mt-2 text-xs text-gray-500">
          Le prix et la disponibilité ne s'affichent que si la fiche porte des données
          structurées : c'est le cas sur « Mon site » et sur Shopify.
        </p>
      ) : null}
    </section>
  )
}
