import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import ChangePassword from "./pages/ChangePassword";
import PowerBI from "./pages/PowerBI";
import AdminUsers from "./pages/AdminUsers";
import AdminAnalytics from "./pages/AdminAnalytics";
import AdminPermissions from "./pages/AdminPermissions";
import Reagenda from "./pages/Reagenda";
import MaterialColeta from "./pages/MaterialColeta";
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

// Pages that should persist their state (all protected pages except Dashboard which resets)
const persistentPages = [
  { path: "/alterar-senha", element: <ProtectedRoute><ChangePassword /></ProtectedRoute> },
  { path: "/powerbi", element: <ProtectedRoute><PowerBI /></ProtectedRoute> },
  { path: "/admin/usuarios", element: <ProtectedRoute><AdminUsers /></ProtectedRoute> },
  { path: "/admin/analytics", element: <ProtectedRoute><AdminAnalytics /></ProtectedRoute> },
  { path: "/admin/perfis", element: <ProtectedRoute><AdminPermissions /></ProtectedRoute> },
  { path: "/reagenda", element: <ProtectedRoute><Reagenda /></ProtectedRoute> },
  { path: "/material-coleta", element: <ProtectedRoute><MaterialColeta /></ProtectedRoute> },
];

const AppRoutes = () => {
  const location = useLocation();
  const isPersistentRoute = persistentPages.some(p => p.path === location.pathname);

  return (
    <>
      {/* Persistent pages stay mounted, hidden via CSS */}
      {persistentPages.map(({ path, element }) => (
        <PersistentPage key={path} path={path}>
          {element}
        </PersistentPage>
      ))}

      {/* Non-persistent pages render normally via Routes */}
      {!isPersistentRoute && (
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
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
