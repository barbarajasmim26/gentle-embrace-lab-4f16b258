import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useAuth } from "@/hooks/use-auth";
import LoginPage from "@/pages/LoginPage";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center justify-between border-b bg-card px-4 shrink-0">
            <SidebarTrigger className="ml-1" />
            <Button variant="ghost" size="sm" onClick={signOut} className="text-xs text-muted-foreground">
              <LogOut className="h-3.5 w-3.5 mr-1" />
              Sair
            </Button>
          </header>
          <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
