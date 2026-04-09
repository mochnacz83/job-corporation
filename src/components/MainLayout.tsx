import React from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import { useAuth } from "@/hooks/useAuth";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const { profile } = useAuth();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border/50 bg-card/60 backdrop-blur-sm sticky top-0 z-40 px-2">
            <SidebarTrigger className="ml-1" />
            <div className="ml-auto flex items-center gap-2 pr-3">
              <span className="text-xs text-muted-foreground hidden sm:inline">
                {profile?.nome}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                {profile?.matricula}
              </span>
            </div>
          </header>
          <main className="flex-1 overflow-auto flex flex-col">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default MainLayout;
