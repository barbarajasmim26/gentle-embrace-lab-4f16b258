import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/use-auth";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import TenantsPage from "./pages/TenantsPage";
import TenantProfilePage from "./pages/TenantProfilePage";
import FormerTenantsPage from "./pages/FormerTenantsPage";
import OverduePage from "./pages/OverduePage";
import AlertsPage from "./pages/AlertsPage";
import CalendarPage from "./pages/CalendarPage";
import ReportsPage from "./pages/ReportsPage";
import ReceiptPage from "./pages/ReceiptPage";
import SearchPage from "./pages/SearchPage";
import WhatsAppPage from "./pages/WhatsAppPage";
import WhatsAppAutoPage from "./pages/WhatsAppAutoPage";
import ContractImportPage from "./pages/ContractImportPage";
import SettingsPage from "./pages/SettingsPage";
import AutomationPage from "./pages/AutomationPage";
import FinancialCenterPage from "./pages/FinancialCenterPage";
import PropertyManagementPage from "./pages/PropertyManagementPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function AuthenticatedApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/tenants" element={<TenantsPage />} />
        <Route path="/tenants/:id" element={<TenantProfilePage />} />
        <Route path="/former-tenants" element={<FormerTenantsPage />} />
        <Route path="/overdue" element={<OverduePage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/receipts" element={<ReceiptPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/whatsapp" element={<WhatsAppPage />} />
        <Route path="/whatsapp-auto" element={<WhatsAppAutoPage />} />
        <Route path="/automation" element={<AutomationPage />} />
        <Route path="/financial" element={<FinancialCenterPage />} />
        <Route path="/properties" element={<PropertyManagementPage />} />
        <Route path="/contracts/import" element={<ContractImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<DashboardPage />} />
      </Routes>
    </AppLayout>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="mesquita-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BrowserRouter>
            <AuthenticatedApp />
          </BrowserRouter>
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
