import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import MainLayout from "@/components/MainLayout";
import { lazy, Suspense, useEffect, useState, ReactNode } from "react";
import PageLoader from "@/components/PageLoader";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60 * 1000, // 60 seconds
    },
  },
});

// Lazy load pages
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const PowerBI = lazy(() => import("./pages/PowerBI"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminAnalytics = lazy(() => import("./pages/AdminAnalytics"));
const AdminPermissions = lazy(() => import("./pages/AdminPermissions"));
const Reagenda = lazy(() => import("./pages/Reagenda"));
const MaterialColeta = lazy(() => import("./pages/MaterialColeta"));
const VistoriaCampo = lazy(() => import("./pages/VistoriaCampo"));
const Inventory = lazy(() => import("./pages/Inventory"));

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
    <div style={{ display: isActive ? "flex" : "none", flexDirection: "column", height: "100%" }}>
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </div>
  );
};

// Pages that should persist their state
const persistentPages = [
  { path: "/alterar-senha", element: <ChangePassword /> },
  { path: "/powerbi", element: <PowerBI /> },
  { path: "/admin/usuarios", element: <AdminUsers /> },
  { path: "/admin/analytics", element: <AdminAnalytics /> },
  { path: "/admin/perfis", element: <AdminPermissions /> },
  { path: "/reagenda", element: <Reagenda /> },
  { path: "/material-coleta", element: <MaterialColeta /> },
  { path: "/vistoria-campo", element: <VistoriaCampo /> },
  { path: "/inventario", element: <Inventory /> },
];

const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));

const AppRoutes = () => {
  const location = useLocation();
  const isLoginRoute = location.pathname === "/";
  const isPersistentRoute = persistentPages.some(p => p.path === location.pathname);
  const isDashboard = location.pathname === "/dashboard";
  const isProtectedArea = isPersistentRoute || isDashboard;

  return (
    <Suspense fallback={<PageLoader />}>
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
            {isDashboard && (
              <Suspense fallback={<PageLoader />}>
                <Dashboard />
              </Suspense>
            )}
          </MainLayout>
        </ProtectedRoute>
      )}

      {/* 404 */}
      {!isLoginRoute && !isProtectedArea && !isPersistentRoute && (
        <Routes>
          <Route path="*" element={<NotFound />} />
        </Routes>
      )}
    </Suspense>
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
