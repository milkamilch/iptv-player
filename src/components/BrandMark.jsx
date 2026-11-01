// Pfade aus assets/icon.svg ohne Hintergrundkreis. Die Gradient-ID ist fest:
// Login und App sind nie gleichzeitig gemountet.
export default function BrandMark({ size = 18, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size * 292 / 340}
      viewBox="80 104 340 292"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="nw-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b98cff" />
          <stop offset="1" stopColor="#7f5ae0" />
        </linearGradient>
      </defs>
      <path d="M104 300 C152 204,200 204,248 300 S344 396,392 300" fill="none" stroke="url(#nw-grad)" strokeWidth="48" strokeLinecap="round" />
      <path d="M372 104 A58 58 0 1 0 420 196 A46 46 0 1 1 372 104 Z" fill="#b98cff" />
    </svg>
  );
}
