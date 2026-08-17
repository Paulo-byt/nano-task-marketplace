import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export function StateCard({
  title,
  message,
  className,
  children,
}: {
  title?: string;
  message: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={className}>
      {title && (
        <h2 className="border-b border-border px-5 py-4 text-sm font-semibold text-foreground">
          {title}
        </h2>
      )}
      <div className="px-5 py-8 text-center text-sm text-zinc-500">
        {message}
        {children}
      </div>
    </Card>
  );
}
