import { LayoutDashboard, FileText, UserX, AlertTriangle, Bell, Calendar, BarChart3, Receipt, Search, MessageCircle, LogOut, Home, Upload, Moon, Sun, Settings, Bot } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Zap, DollarSign, Lightbulb } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";

const menuItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Contratos", url: "/tenants", icon: FileText },
  { title: "Importar Contrato", url: "/contracts/import", icon: Upload },
  { title: "Ex-Inquilinos", url: "/former-tenants", icon: UserX },
  { title: "Atrasados", url: "/overdue", icon: AlertTriangle },
  { title: "Alertas", url: "/alerts", icon: Bell },
  { title: "Calendário", url: "/calendar", icon: Calendar },
  { title: "Relatórios", url: "/reports", icon: BarChart3 },
  { title: "Central Financeira", url: "/financial", icon: DollarSign },
  { title: "Automação", url: "/automation", icon: Zap },
  { title: "Notificações", url: "/notifications", icon: Bell },
  { title: "Inteligência", url: "/intelligence", icon: Lightbulb },
  { title: "Recibo", url: "/receipts", icon: Receipt },
  { title: "Busca Rápida", url: "/search", icon: Search },
  { title: "Assistente de IA", url: "/whatsapp-auto", icon: Bot },
{ title: "Configurações", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent className="py-2">
        {/* Branding */}
        <div className={`flex items-center gap-3 px-4 py-4 ${collapsed ? "justify-center" : ""}`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm shrink-0">
            <Home className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-bold text-sidebar-foreground">Gestão</p>
              <p className="text-[10px] text-sidebar-foreground/60">de Imóveis</p>
            </div>
          )}
        </div>

        {/* Menu */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      activeClassName="bg-sidebar-primary text-sidebar-primary-foreground font-semibold shadow-md"
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 space-y-1 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg"
        >
          {theme === "light" ? <Moon className="mr-2 h-4 w-4" /> : <Sun className="mr-2 h-4 w-4" />}
          {!collapsed && (theme === "light" ? "Tema Escuro" : "Tema Claro")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 rounded-lg"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && "Sair"}
        </Button>
        {!collapsed && (
          <p className="text-[10px] text-sidebar-foreground/40 text-center pt-1">Sistema de Aluguel v1.0</p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
