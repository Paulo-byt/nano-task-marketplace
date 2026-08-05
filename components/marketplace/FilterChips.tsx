interface FilterChipsProps {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
}

export function FilterChips({
  categories,
  selected,
  onSelect,
}: FilterChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => {
        const isSelected = category === selected;
        return (
          <button
            key={category}
            type="button"
            onClick={() => onSelect(category)}
            aria-pressed={isSelected}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              isSelected
                ? "border-foreground bg-foreground text-background"
                : "border-black/10 text-zinc-600 hover:border-black/20 hover:text-foreground dark:border-white/15 dark:text-zinc-400 dark:hover:border-white/30"
            }`}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}
