/**
 * Le fond vivant du thème glassmorphism.
 *
 * D'après les trois références fournies le 04/09/2026 : un noir profond où
 * des formes multicolores — sphères dégradées, gouttes liquides, anneaux —
 * naissent, dérivent lentement, se croisent et se défont. Les blocs en verre
 * dépoli posés dessus (backdrop-blur des sections) laissent transparaître
 * leurs couleurs, c'est tout l'effet.
 *
 * Tout est animé au compositeur (transform + opacity seulement) : six formes
 * floutées ne coûtent presque rien, et `prefers-reduced-motion` fige le
 * décor pour qui a demandé le calme. Les couleurs sont les mêmes néons que
 * les graphiques du tableau de bord.
 */
export function FondVivant() {
  return (
    <div aria-hidden className="fond-vivant fixed inset-0 z-0 overflow-hidden bg-[#08070f]">
      {/* Les gouttes de la lampe : elles partent du bas, montent en s'étirant,
          redescendent — chacune sa colonne, son rythme et son retard. */}
      <span className="blob blob-a" />
      <span className="blob blob-b" />
      <span className="blob blob-c" />
      <span className="blob blob-d" />
      <span className="blob blob-e" />
      <span className="blob blob-f" />
      {/* Deux anneaux fins, discrets, en dérive lente. */}
      <span className="anneau anneau-a" />
      <span className="anneau anneau-b" />
    </div>
  )
}
