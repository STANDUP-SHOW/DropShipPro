import { useEffect, useRef, useState } from 'react'

/**
 * Money field that survives real typing.
 *
 * A controlled `type="number"` fed through `Number()` breaks in two ways users hit
 * immediately: the French numeric keypad types a comma, and `Number("12,")` is NaN,
 * which blanks the field mid-entry; and clearing the box yields `Number("")` === 0,
 * so the zero can never be deleted.
 *
 * The raw text is kept while typing and only converted on blur.
 */
/** Reads a typed amount, tolerating a comma and stray characters. */
function parseAmount(raw: string): number | null {
  const parsed = parseFloat(raw.replace(',', '.').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null
}

export function PriceInput({
  value,
  onCommit,
  onLiveChange,
  className = '',
  ...rest
}: {
  value: number
  /** Called when the field is left: the moment to persist. */
  onCommit: (value: number) => void
  /** Called on every keystroke, so figures computed from this value follow along. */
  onLiveChange?: (value: number) => void
  className?: string
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'type'>) {
  const ref = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => String(value ?? 0))

  // Follow changes coming from elsewhere (loading the product, the +50% button),
  // but never while the field has focus — that would fight the user's typing.
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(String(value ?? 0))
  }, [value])

  function commit() {
    const next = parseAmount(text) ?? 0
    setText(String(next))
    if (next !== value) onCommit(next)
  }

  return (
    <input
      ref={ref}
      // "decimal" rather than type=number: it opens the numeric keypad on mobile
      // without the browser rejecting a comma as you type.
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        // Anything derived from this amount — a margin, a total — must follow the
        // typing instead of waiting for the field to lose focus.
        const live = parseAmount(e.target.value)
        if (live !== null) onLiveChange?.(live)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className={className}
      {...rest}
    />
  )
}
