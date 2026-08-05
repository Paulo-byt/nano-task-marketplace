interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Search tasks..."
      aria-label="Search tasks"
      className="w-full rounded-full border border-black/10 bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-zinc-500 focus:border-black/20 dark:border-white/15 dark:focus:border-white/30"
    />
  );
}
