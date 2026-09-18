/** Two synchronized arcs - the Chroma Sync mark. Renders crisply at any size, unlike a CSS clip-path hack. */
export default function LogoMark({ size = 20, className }: { size?: number, className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
      className={className}
    >
      <path
        d="M17 6.2C15.4 3.6 12.4 1.8 9 1.8 4.6 1.8 1 5.4 1 9.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M3 13.6C4.6 16.2 7.6 18 11 18c4.4 0 8-3.6 8-8"
        stroke="#1b4ce0"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
