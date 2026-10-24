import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/lib/i18n";
import TopLoader from "@/components/TopLoader";
import PageTransition from "@/components/PageTransition";
import BottomNav from "@/components/BottomNav";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import AdOverlay from "@/components/AdOverlay";

import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Player from "./pages/Player";
import Payment from "./pages/Payment";
import Profile from "./pages/Profile";
import About from "./pages/About";
import Notifications from "./pages/Notifications";
import AppDownload from "./pages/AppDownload";
import Referral from "./pages/Referral";
import Movies from "./pages/Movies";
import MovieDetail from "./pages/MovieDetail";
import LiveMatches from "./pages/LiveMatches";
import Legal from "./pages/Legal";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LanguageProvider>
        <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <TopLoader />
          <PageTransition>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/player/:id" element={<Player />} />
              <Route path="/payment" element={<Payment />} />
              <Route path="/packages" element={<Payment />} />
              <Route path="/livetv" element={<LiveMatches />} />
              <Route path="/matches" element={<LiveMatches />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/referral" element={<Referral />} />
              <Route path="/movies" element={<Movies />} />
              <Route path="/movies/:slug" element={<MovieDetail />} />
              <Route path="/app" element={<AppDownload />} />
              <Route path="/about" element={<About />} />
              <Route path="/terms" element={<Legal kind="terms" />} />
              <Route path="/privacy" element={<Legal kind="privacy" />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </PageTransition>
          <FloatingWhatsApp />
          <BottomNav />
          <AdOverlay />
        </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
