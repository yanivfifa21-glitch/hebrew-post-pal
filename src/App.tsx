import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthGuard } from "@/components/auth/AuthGuard";
import Dashboard from "./pages/Dashboard";
import AddProduct from "./pages/AddProduct";
import Queue from "./pages/Queue";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Discovery from "./pages/Discovery";
import FreeSearch from "./pages/FreeSearch";
import ManualSend from "./pages/ManualSend";
import Zones from "./pages/Zones";
import Coupons from "./pages/Coupons";
import CollageGenerator from "./pages/CollageGenerator";
import GroupListener from "./pages/GroupListener";
import StoreScanner from "./pages/StoreScanner";
import EarningsDashboard from "./pages/EarningsDashboard";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/" element={<AuthGuard><Dashboard /></AuthGuard>} />
          <Route path="/add-product" element={<AuthGuard><AddProduct /></AuthGuard>} />
          <Route path="/queue" element={<AuthGuard><Queue /></AuthGuard>} />
          <Route path="/history" element={<AuthGuard><History /></AuthGuard>} />
          <Route path="/settings" element={<AuthGuard><Settings /></AuthGuard>} />
          <Route path="/discovery" element={<AuthGuard><Discovery /></AuthGuard>} />
          <Route path="/free-search" element={<AuthGuard><FreeSearch /></AuthGuard>} />
          <Route path="/manual-send" element={<AuthGuard><ManualSend /></AuthGuard>} />
          <Route path="/zones" element={<AuthGuard><Zones /></AuthGuard>} />
          <Route path="/coupons" element={<AuthGuard><Coupons /></AuthGuard>} />
          <Route path="/collage" element={<AuthGuard><CollageGenerator /></AuthGuard>} />
          <Route path="/group-listener" element={<AuthGuard><GroupListener /></AuthGuard>} />
          <Route path="/store-scanner" element={<AuthGuard><StoreScanner /></AuthGuard>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
