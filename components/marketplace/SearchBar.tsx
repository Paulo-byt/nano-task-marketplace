import { Input } from "@/components/ui/Input";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-zinc-400"
      >
        <SearchIcon />
      </span>
      {/* paddingLeft/borderRadius are set inline rather than via className:
          Input's own base classes already declare px-3 and rounded-lg, and
          cn() is a plain string join with no specificity resolution, so a
          conflicting utility class here would have unpredictable
          precedence against Input's own. An inline style always wins,
          without touching Input.tsx itself for one call site's icon. */}
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search tasks..."
        aria-label="Search tasks"
        style={{ paddingLeft: "2.5rem", borderRadius: "9999px" }}
      />
    </div>
  );
}
