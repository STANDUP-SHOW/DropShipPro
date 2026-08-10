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
export function PriceInput({
  value,
  onCommit,
  className = '',
  ...rest
}: {
  value: number
  onCommit: (value: number) => void
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
    const parsed = parseFloat(text.replace(',', '.').replace(/[^\d.-]/g, ''))
    const next = Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0
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
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      className={className}
      {...rest}
    />
  )
}
