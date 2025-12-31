import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = ({ children }: MainLayoutProps) => {
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
