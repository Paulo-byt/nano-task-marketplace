import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

type BadgeTone = "success" | "warning" | "error" | "neutral" | "info";

// Tone is purely visual -- no status name (approved/pending/cancelled/...)
// is known here. Mapping a domain status to a tone stays in the consumer.
const TONE_STYLES: Record<BadgeTone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  error: "bg-error/10 text-error",
  info: "bg-info/10 text-info",
  neutral: "bg-foreground/5 text-foreground/60",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        TONE_STYLES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
