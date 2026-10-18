interface CategoryChipsProps {
  categories: string[];
  selected: string;
  onSelect: (category: string) => void;
}

/**
 * Horizontally scrollable pill-shaped category chips with edge-fade indicators.
 * Selected chip uses the primary color with a glow; others use the glass style.
 */
export default function CategoryChips({ categories, selected, onSelect }: CategoryChipsProps) {
  if (categories.length <= 1) return null;

  return (
    <div className="relative">
      <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth">
        {categories.map((cat) => {
          const active = selected === cat;
          return (
            <button
              key={cat}
              onClick={() => onSelect(cat)}
              aria-pressed={active}
              className={`shrink-0 snap-start px-4 py-2 rounded-full text-xs font-black uppercase tracking-wide press tap-safe transition-all duration-200 ${
                active
                  ? 'bg-primary text-primary-foreground glow-primary'
                  : 'glass text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </div>
      {/* Edge fade indicators */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent"
      />
    </div>
  );
}
