import { Star } from 'lucide-react'

export interface PublicReview {
  id: string
  displayName: string
  rating: number
  comment: string
  createdAt: string
}

/** Read-only rating. `size` lets the same component serve a card and a heading. */
export function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={n <= rating ? 'text-yellow-400' : 'text-gray-600'}
          fill={n <= rating ? 'currentColor' : 'none'}
        />
      ))}
    </span>
  )
}

/** Clickable rating, used in the form. */
export function StarPicker({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`Noter ${n} sur 5`}
          aria-pressed={value === n}
          className="p-0.5 transition hover:scale-110"
        >
          <Star
            size={26}
            className={n <= value ? 'text-yellow-400' : 'text-gray-600'}
            fill={n <= value ? 'currentColor' : 'none'}
          />
        </button>
      ))}
    </div>
  )
}

function initials(name: string) {
  const words = name.split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)).toUpperCase()
}

export function ReviewCard({ review }: { review: PublicReview }) {
  const date = new Date(review.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <article className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-purple-500/25 text-xs font-bold text-purple-100">
          {initials(review.displayName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{review.displayName}</p>
          <p className="text-xs text-gray-500">{date}</p>
        </div>
      </div>
      <div className="mt-3">
        <Stars rating={review.rating} />
      </div>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-300">{review.comment}</p>
    </article>
  )
}

export function ReviewGrid({ reviews }: { reviews: PublicReview[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </div>
  )
}
