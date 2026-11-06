export function Mark({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" fill="#00aeff" />
      <rect x="6" y="6" width="7" height="7" fill="#fff" />
      <path d="M11 11 21 21" stroke="#fff" strokeWidth="2.5" />
      <circle cx="22" cy="22" r="4" fill="#fff" />
    </svg>
  );
}
