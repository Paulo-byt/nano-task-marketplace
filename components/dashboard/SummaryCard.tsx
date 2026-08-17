import { Card } from "@/components/ui/Card";

type SummaryCardTone = "neutral" | "primary" | "success" | "warning";

// Every stat card rendered the exact same way regardless of what it
// represented -- the actual reason this whole family read as flat/
// monochrome despite already using tokens correctly. tone is opt-in
// (defaults to the original neutral/foreground look), so every existing
// call site keeps rendering exactly as before unless it explicitly opts
// into an accent.
const VALUE_TONE_STYLES: Record<SummaryCardTone, string> = {
  neutral: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
};

interface SummaryCardProps {
  label: string;
  value: string;
  tone?: SummaryCardTone;
}

export function SummaryCard({ label, value, tone = "neutral" }: SummaryCardProps) {
  return (
    <Card className="p-5 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${VALUE_TONE_STYLES[tone]}`}>
        {value}
      </p>
    </Card>
  );
}
