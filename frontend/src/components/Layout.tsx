import { NavLink, Outlet } from "react-router-dom";
import { Database, FileText, MessageSquare, Search, ClipboardCheck } from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { to: "/indices", label: "인덱스", icon: Database },
  { to: "/documents", label: "문서", icon: FileText },
  { to: "/search", label: "검색", icon: Search },
  { to: "/chat", label: "채팅", icon: MessageSquare },
  { to: "/eval", label: "평가", icon: ClipboardCheck, wip: true },
];

export default function Layout() {
  return (
    <div className="flex h-full bg-background">
      <aside className="w-64 border-r bg-muted/30 p-4">
        <div className="mb-8 px-2">
          <h1 className="text-lg font-bold">RAGOps Studio</h1>
          <p className="text-xs text-muted-foreground">Elasticsearch RAG Console</p>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )
                }
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                {item.wip && (
                  <span className="rounded bg-yellow-200 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-900">
                    작업 중
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
