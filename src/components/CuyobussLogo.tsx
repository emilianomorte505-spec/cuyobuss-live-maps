export function CuyobussLogo({ className = "mark" }: { className?: string }) {
  return (
    <span className={className}>
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M8 31V18c0-5 4-9 9-9h9c8 0 14 6 14 14v8H8Z" fill="currentColor" />
        <path
          d="M16 9 11 4l10 5M29 10l6-6-1 10"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path d="M14 18h9v7h-9zM27 18h7v7h-7z" fill="#17211b" />
        <circle cx="17" cy="34" r="5" fill="currentColor" stroke="#17211b" strokeWidth="3" />
        <circle cx="34" cy="34" r="5" fill="currentColor" stroke="#17211b" strokeWidth="3" />
        <path d="m36 13 7 4-5 4" fill="currentColor" />
      </svg>
    </span>
  );
}
