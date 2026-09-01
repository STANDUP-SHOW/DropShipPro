import { useState } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'

/**
 * Les options d'achat, saisies à la main quand l'import ne les a pas trouvées.
 *
 * Ce que ça remplace : deux champs de texte, l'un pour le nom, l'autre pour les
 * valeurs séparées par des virgules. Deux défauts, et le premier était un vrai
 * bug d'affichage :
 *
 * **Les champs n'étaient pas contrôlés.** `defaultValue` avec `onBlur` : React
 * ne réécrit jamais un champ après son montage. Renommer une dimension
 * reconstruisait l'objet, la ligne se remontait avec l'ancien contenu, et le
 * vendeur voyait ses valeurs revenir en arrière sous ses yeux. Tout est
 * contrôlé ici : ce qui est à l'écran est ce qui est enregistré.
 *
 * **Rien n'était proposé.** Il fallait connaître le vocabulaire attendu et le
 * taper. Or les noms de dimensions ne sont pas libres : ce sont eux qui se
 * traduisent en options chez Shopify, en attributs chez Google. « Coloris » et
 * « Couleur » désignent la même chose et se rangent différemment.
 *
 * Les dimensions proposées sont celles que la réparation automatique sait
 * reconnaître (`variantRepair.ts`) et que Shopify ordonne (`ORDRE_OPTIONS`).
 * Un nom libre reste possible — un fournisseur inventera toujours une dimension
 * à laquelle personne n'a pensé.
 */

/** Les dimensions connues, et ce qu'on propose pour chacune. */
const DIMENSIONS: Array<{ nom: string; suggestions: string[] }> = [
  {
    nom: 'Couleur',
    suggestions: ['Noir', 'Blanc', 'Gris', 'Bleu', 'Rouge', 'Vert', 'Rose', 'Beige', 'Marron', 'Doré', 'Argent'],
  },
  { nom: 'Taille', suggestions: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] },
  {
    nom: 'Pointure',
    suggestions: ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46'],
  },
  { nom: 'Capacité', suggestions: ['64 Go', '128 Go', '256 Go', '512 Go', '1 To', '2 To'] },
  { nom: 'Modèle', suggestions: [] },
  { nom: 'Longueur', suggestions: ['50 cm', '1 m', '1,5 m', '2 m', '3 m', '5 m'] },
  { nom: 'Puissance', suggestions: ['20 W', '45 W', '65 W', '100 W'] },
  { nom: 'Prise', suggestions: ['UE', 'UK', 'US', 'USB-C', 'Micro-USB', 'Lightning'] },
  { nom: 'Matière', suggestions: ['Coton', 'Cuir', 'Acier inoxydable', 'Silicone', 'Aluminium', 'Verre'] },
  { nom: 'Contenance', suggestions: ['30 ml', '50 ml', '100 ml', '200 ml'] },
]

export function VariantEditor({
  variants,
  onChange,
}: {
  variants: Record<string, string[]>
  onChange: (next: Record<string, string[]>) => void
}) {
  const [ajout, setAjout] = useState(false)
  const dimensions = Object.entries(variants)

  /** Les dimensions connues qui ne sont pas déjà posées. */
  const restantes = DIMENSIONS.filter((d) => !(d.nom in variants))

  const ajouter = (nom: string) => {
    const propre = nom.trim()
    if (!propre || propre in variants) return
    onChange({ ...variants, [propre]: [] })
    setAjout(false)
  }

  const renommer = (ancien: string, nouveau: string) => {
    const propre = nouveau.trim()
    if (!propre || propre === ancien || propre in variants) return
    // Reconstruit dans l'ordre : renommer ne doit pas faire sauter la ligne en
    // bas de la liste sous les yeux du vendeur.
    onChange(
      Object.fromEntries(
        Object.entries(variants).map(([k, v]) => (k === ancien ? [propre, v] : [k, v])),
      ),
    )
  }

  return (
    <div className="space-y-3">
      {dimensions.length === 0 ? (
        <p className="text-xs leading-relaxed text-gray-500">
          Aucune option d'achat. L'import les relève sur la page du fournisseur quand il les trouve —
          ajoutez-les ici sinon. Sans elles, l'acheteur ne peut pas choisir sa taille ni sa couleur.
        </p>
      ) : null}

      {dimensions.map(([nom, valeurs]) => (
        <Dimension
          key={nom}
          nom={nom}
          valeurs={valeurs}
          suggestions={DIMENSIONS.find((d) => d.nom === nom)?.suggestions ?? []}
          onRenommer={(n) => renommer(nom, n)}
          onValeurs={(v) => onChange({ ...variants, [nom]: v })}
          onSupprimer={() => {
            const next = { ...variants }
            delete next[nom]
            onChange(next)
          }}
        />
      ))}

      {/* --- Ajouter une dimension --- */}
      {ajout ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-gray-400">Quelle option ajouter ?</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {restantes.map((d) => (
              <button
                key={d.nom}
                type="button"
                onClick={() => ajouter(d.nom)}
                className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs transition hover:border-purple-400/50 hover:bg-white/10"
              >
                {d.nom}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              autoFocus
              placeholder="Ou un autre nom…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') ajouter((e.target as HTMLInputElement).value)
                if (e.key === 'Escape') setAjout(false)
              }}
              className="flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-3 py-2 text-xs outline-none focus:border-purple-400/70"
            />
            <button
              type="button"
              onClick={() => setAjout(false)}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-400 hover:bg-white/5"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAjout(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 py-2.5 text-xs text-gray-400 transition hover:border-purple-400/50 hover:text-white"
        >
          <Plus size={14} />
          <span>Ajouter une option</span>
        </button>
      )}

      {/*
        Trois options au plus, et Shopify refuse le produit entier au-delà — pas
        l'option en trop, le produit. Le dire avant vaut mieux qu'un refus à la
        publication.
      */}
      {dimensions.length > 3 ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
          Shopify n'accepte que trois options : les trois premières seront transmises, les suivantes
          ignorées. Vinted et Leboncoin n'en acceptent qu'une.
        </p>
      ) : null}
    </div>
  )
}

/** Une dimension et ses valeurs, en pastilles retirables. */
function Dimension({
  nom,
  valeurs,
  suggestions,
  onRenommer,
  onValeurs,
  onSupprimer,
}: {
  nom: string
  valeurs: string[]
  suggestions: string[]
  onRenommer: (nom: string) => void
  onValeurs: (valeurs: string[]) => void
  onSupprimer: () => void
}) {
  const [saisie, setSaisie] = useState('')
  const [titre, setTitre] = useState(nom)

  const ajouterValeur = (brut: string) => {
    /*
     * La virgule reste acceptée, et c'est délibéré.
     *
     * Le vendeur qui a sa liste dans le presse-papier la colle d'un coup :
     * l'obliger à valider onze fois pour onze couleurs serait un recul par
     * rapport au champ qu'on remplace.
     */
    const nouvelles = brut
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v && !valeurs.includes(v))
    if (!nouvelles.length) return
    onValeurs([...valeurs, ...nouvelles])
    setSaisie('')
  }

  const libres = suggestions.filter((s) => !valeurs.includes(s))

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2">
        <input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          onBlur={() => (titre.trim() ? onRenommer(titre) : setTitre(nom))}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium outline-none focus:border-purple-400/70"
        />
        <span className="shrink-0 text-[11px] text-gray-500">{`${valeurs.length} valeur(s)`}</span>
        <button
          type="button"
          onClick={onSupprimer}
          title="Retirer cette option"
          className="shrink-0 rounded-lg border border-white/10 p-1.5 text-gray-500 transition hover:bg-red-500/10 hover:text-red-300"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {valeurs.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {valeurs.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-purple-400/40 bg-purple-500/15 py-1 pl-2.5 pr-1.5 text-xs"
            >
              <span>{v}</span>
              <button
                type="button"
                onClick={() => onValeurs(valeurs.filter((x) => x !== v))}
                className="text-purple-200/70 transition hover:text-white"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex gap-2">
        <input
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), ajouterValeur(saisie))}
          placeholder={suggestions.length ? `${suggestions.slice(0, 3).join(', ')}…` : 'Une valeur'}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-xs outline-none focus:border-purple-400/70"
        />
        <button
          type="button"
          onClick={() => ajouterValeur(saisie)}
          disabled={!saisie.trim()}
          className="shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs transition hover:bg-white/5 disabled:opacity-40"
        >
          <Plus size={13} />
        </button>
      </div>

      {libres.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {libres.slice(0, 12).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onValeurs([...valeurs, s])}
              className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-gray-400 transition hover:border-purple-400/40 hover:text-white"
            >
              {`+ ${s}`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
