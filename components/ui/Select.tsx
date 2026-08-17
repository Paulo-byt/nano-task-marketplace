import type { SelectHTMLAttributes } from "react";
import { cn } from "@/components/ui/cn";

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground transition-colors focus:border-foreground/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}
