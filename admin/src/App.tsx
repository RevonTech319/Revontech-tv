import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

import AdminLogin from './pages/AdminLogin';
import Dashboard from './pages/Dashboard';
import Channels from './pages/Channels';
import Slider from './pages/Slider';
import Plans from './pages/Plans';
import Payments from './pages/Payments';
import Token from './pages/Token';
import Users from './pages/Users';
import Notifications from './pages/Notifications';
import Settings from './pages/Settings';
import Subscribers from './pages/Subscribers';
import LegalPages from './pages/LegalPages';
import BackupLinks from './pages/BackupLinks';
import ApiAccess from './pages/ApiAccess';
import Ads from './pages/Ads';
import Referrals from './pages/Referrals';
import Movies from './pages/Movies';

const queryClient = new QueryClient();

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }
  if (!user || !isAdmin) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<AdminLogin />} />
            <Route path="/" element={<RequireAdmin><Dashboard /></RequireAdmin>} />
            <Route path="/channels" element={<RequireAdmin><Channels /></RequireAdmin>} />
            <Route path="/movies" element={<RequireAdmin><Movies /></RequireAdmin>} />
            <Route path="/slider" element={<RequireAdmin><Slider /></RequireAdmin>} />
            <Route path="/plans" element={<RequireAdmin><Plans /></RequireAdmin>} />
            <Route path="/payments" element={<RequireAdmin><Payments /></RequireAdmin>} />
            <Route path="/token" element={<RequireAdmin><Token /></RequireAdmin>} />
            <Route path="/users" element={<RequireAdmin><Users /></RequireAdmin>} />
            <Route path="/subscribers" element={<RequireAdmin><Subscribers /></RequireAdmin>} />
            <Route path="/api-access" element={<RequireAdmin><ApiAccess /></RequireAdmin>} />
            <Route path="/backup" element={<RequireAdmin><BackupLinks /></RequireAdmin>} />
            <Route path="/legal" element={<RequireAdmin><LegalPages /></RequireAdmin>} />
            <Route path="/notifications" element={<RequireAdmin><Notifications /></RequireAdmin>} />
            <Route path="/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
            <Route path="/ads" element={<RequireAdmin><Ads /></RequireAdmin>} />
            <Route path="/referrals" element={<RequireAdmin><Referrals /></RequireAdmin>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
