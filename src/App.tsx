import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import MainLayout from "@/components/MainLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ChangePassword from "./pages/ChangePassword";
import PowerBI from "./pages/PowerBI";
import AdminUsers from "./pages/AdminUsers";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminPermissions from "./pages/AdminPermissions";
import Reagenda from "./pages/Reagenda";
import MaterialColeta from "./pages/MaterialColeta";
import VistoriaCampo from "./pages/VistoriaCampo";
import Inventory from "./pages/Inventory";
import NotFound from "./pages/NotFound";
import { useEffect, useState, ReactNode } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

// Generic persistent page wrapper: mounts once, then hides/shows via CSS
const PersistentPage = ({ path, children }: { path: string; children: ReactNode }) => {
  const location = useLocation();
  const isActive = location.pathname === path;
  const [hasBeenMounted, setHasBeenMounted] = useState(false);

  useEffect(() => {
    if (isActive && !hasBeenMounted) setHasBeenMounted(true);
  }, [isActive, hasBeenMounted]);

  if (!hasBeenMounted) return null;

  return (
    <div style={{ display: isActive ? "block" : "none" }}>
      {children}
    </div>
  );
};

// Pages that should persist their state
const persistentPages = [
  { path: "/alterar-senha", element: <ProtectedRoute><ChangePassword /></ProtectedRoute> },
  { path: "/powerbi", element: <ProtectedRoute><PowerBI /></ProtectedRoute> },
  { path: "/admin/usuarios", element: <ProtectedRoute><AdminUsers /></ProtectedRoute> },
  { path: "/admin/analytics", element: <ProtectedRoute><AdminAnalytics /></ProtectedRoute> },
  { path: "/admin/perfis", element: <ProtectedRoute><AdminPermissions /></ProtectedRoute> },
  { path: "/reagenda", element: <ProtectedRoute><Reagenda /></ProtectedRoute> },
  { path: "/material-coleta", element: <ProtectedRoute><MaterialColeta /></ProtectedRoute> },
  { path: "/vistoria-campo", element: <ProtectedRoute><VistoriaCampo /></ProtectedRoute> },
  { path: "/inventario", element: <ProtectedRoute><Inventory /></ProtectedRoute> },
];

const AppRoutes = () => {
  const location = useLocation();
  const isLoginRoute = location.pathname === "/";
  const isPersistentRoute = persistentPages.some(p => p.path === location.pathname);
  const isDashboard = location.pathname === "/dashboard";
  const isProtectedArea = isPersistentRoute || isDashboard;

  return (
    <>
      {/* Login page - no sidebar */}
      {isLoginRoute && (
        <Routes>
          <Route path="/" element={<Login />} />
        </Routes>
      )}

      {/* Protected pages with sidebar layout */}
      {isProtectedArea && (
        <ProtectedRoute>
          <MainLayout>
            {/* Persistent pages */}
            {persistentPages.map(({ path, element }) => (
              <PersistentPage key={path} path={path}>
                {element}
              </PersistentPage>
            ))}

            {/* Dashboard (non-persistent) */}
            {isDashboard && <Dashboard />}
          </MainLayout>
        </ProtectedRoute>
      )}

      {/* 404 */}
      {!isLoginRoute && !isProtectedArea && !isPersistentRoute && (
        <Routes>
          <Route path="*" element={<NotFound />} />
        </Routes>
      )}
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
