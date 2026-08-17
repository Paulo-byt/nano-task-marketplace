import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function SettingsSection({
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <Card className="p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="mt-1 text-xs text-zinc-500">{description}</p>
        )}
      </div>
      <div className="mt-4 divide-y divide-border">
        {children}
      </div>
    </Card>
  );
}
