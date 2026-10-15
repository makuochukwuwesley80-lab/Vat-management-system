export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="VAT logo"
    >
      <defs>
        <linearGradient id="vatShield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#599fff" />
          <stop offset="55%" stopColor="#1b5bf5" />
          <stop offset="100%" stopColor="#142155" />
        </linearGradient>
        <linearGradient id="vatSheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M32 3 7 12v20c0 15.5 10.4 24.6 25 29 14.6-4.4 25-13.5 25-29V12L32 3Z"
        fill="url(#vatShield)"
      />
      <path
        d="M32 3 7 12v20c0 15.5 10.4 24.6 25 29 14.6-4.4 25-13.5 25-29V12L32 3Z"
        fill="url(#vatSheen)"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1.2"
      />
      <text
        x="32"
        y="41"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="800"
        fontSize="19"
        fill="#ffffff"
        letterSpacing="0.5"
      >
        VAT
      </text>
    </svg>
  );
}
