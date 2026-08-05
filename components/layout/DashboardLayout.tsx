import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <Sidebar />
      <div className="flex-1 px-6 py-6">{children}</div>
    </div>
  );
}
