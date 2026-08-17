function EarnIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CreateIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

const ROLE_ICONS = {
  tasker: EarnIcon,
  creator: CreateIcon,
} as const;

// A real <button> (not Card) for the same reason app/dashboard/settings/
// page.tsx's own nav rows are hand-styled rather than using Card directly:
// this needs to be one real, keyboard-focusable interactive element,
// matching Card's visual language rather than modifying the primitive
// or nesting an interactive element inside a non-interactive one.
export function GettingStartedRoleCard({
  role,
  title,
  description,
  onSelect,
}: {
  role: "tasker" | "creator";
  title: string;
  description: string;
  onSelect: () => void;
}) {
  const Icon = ROLE_ICONS[role];

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col items-start gap-3 rounded-xl border border-border bg-surface p-6 text-left shadow-sm transition-shadow hover:border-primary/30 hover:shadow-md"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon />
      </span>
      <span className="text-lg font-semibold text-foreground">{title}</span>
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{description}</span>
    </button>
  );
}
