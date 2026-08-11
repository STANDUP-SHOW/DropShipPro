export function Logo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2 font-bold text-white" style={{ fontSize: size * 0.7 }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2 21 7v10l-9 5-9-5V7l9-5Z"
          stroke="url(#g)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M3 7 12 12 21 7M12 12v9" stroke="url(#g)" strokeWidth="1.6" strokeLinejoin="round" />
        <defs>
          <linearGradient id="g" x1="3" y1="2" x2="21" y2="21">
            <stop stopColor="#fb923c" />
            <stop offset="1" stopColor="#ec4899" />
          </linearGradient>
        </defs>
      </svg>
      DropShipper IA
    </div>
  )
}
