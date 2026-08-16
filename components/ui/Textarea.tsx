import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/components/ui/cn";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-zinc-500 transition-colors focus:border-foreground/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}
