interface SettingsRowProps {
  label: string;
  value: string;
  description?: string;
}

export function SettingsRow({ label, value, description }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
        )}
      </div>
      <span className="flex-shrink-0 text-sm text-zinc-600 dark:text-zinc-400">
        {value}
      </span>
    </div>
  );
}
