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
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-zinc-600 hover:border-primary/30 hover:bg-primary/5 hover:text-foreground dark:text-zinc-400"
            }`}
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}
