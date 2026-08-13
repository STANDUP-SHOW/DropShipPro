/**
 * Square brand mark for a destination.
 *
 * Deliberately not the real logos: redistributing marketplace logos inside the app
 * is a trademark question we don't need to answer, and a coloured monogram in each
 * brand's own colour is recognisable enough in a list of twenty.
 */
export function PlatformBadge({
  label,
  color,
  size = 28,
}: {
  label: string
  color: string
  size?: number
}) {
  // "La Redoute" → LR, "eBay" → EB: initials of the words, else the first letters.
  const words = label.split(/[\s'’-]+/).filter(Boolean)
  const mark = (words.length > 1 ? words.map((w) => w[0]).join('') : label.slice(0, 2)).slice(0, 2).toUpperCase()

  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-md font-bold text-white"
      style={{ backgroundColor: color, width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {mark}
    </span>
  )
}
