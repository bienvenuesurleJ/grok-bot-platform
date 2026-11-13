export function Mark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--gb-accent)" />
      <path
        d="M9 16.5h8.2a4.2 4.2 0 1 0 0-8.4H11.2V23"
        fill="none"
        stroke="var(--gb-on-accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="21.2" y="14.6" width="2.4" height="2.4" rx="0.4" fill="var(--gb-on-accent)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <Mark />
      <span className="text-sm font-semibold tracking-tight">Grok Bot</span>
    </span>
  );
}
