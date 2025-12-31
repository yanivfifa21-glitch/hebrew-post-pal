import { ReactNode, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";

interface MainLayoutProps {
  children: ReactNode;
}

function unlockScroll() {
  // Defensive: if a Drawer/Dialog locks scroll and navigation happens, restore scrolling.
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  document.body.removeAttribute("data-scroll-locked");

  document.documentElement.style.removeProperty("overflow");
  document.documentElement.style.removeProperty("padding-right");
  document.documentElement.removeAttribute("data-scroll-locked");
}

export const MainLayout = ({ children }: MainLayoutProps) => {
  const location = useLocation();

  useEffect(() => {
    requestAnimationFrame(unlockScroll);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background bg-grid-pattern bg-grid relative overflow-x-hidden">
      {/* Background glow effects */}
      <div className="fixed inset-0 pointer-events-none -z-10">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/5 rounded-full blur-3xl" />
      </div>

      {/* Desktop Sidebar */}
      <Sidebar />

      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* Main Content - responsive margins with mobile top padding for nav button */}
      <main className="md:ml-16 lg:ml-64 transition-all duration-300 relative z-10 pt-20 pb-8 md:pt-0 md:pb-0">
        <div className="p-4 md:p-6 lg:p-8 min-h-screen overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
};
