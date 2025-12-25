import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Plus, 
  List, 
  History, 
  Settings,
  TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { icon: LayoutDashboard, label: "דאשבורד", path: "/" },
  { icon: TrendingUp, label: "גילוי", path: "/discovery" },
  { icon: Plus, label: "הוסף", path: "/add-product", isMain: true },
  { icon: List, label: "תור", path: "/queue" },
  { icon: Settings, label: "הגדרות", path: "/settings" },
];

export const MobileNav = () => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[100] md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {/* Glassmorphism background */}
      <div className="absolute inset-0 bg-background/95 backdrop-blur-xl border-t border-border" />
      
      {/* Gradient accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      
      <div className="relative flex items-center justify-around px-2 py-3">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          
          // Main action button (Add)
          if (item.isMain) {
            return (
              <Link
                key={item.path}
                to={item.path}
                className="relative -mt-6"
              >
                <div className={cn(
                  "flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300",
                  "bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30",
                  isActive && "scale-110 shadow-xl shadow-primary/40"
                )}>
                  <Icon className="h-6 w-6 text-primary-foreground" />
                </div>
              </Link>
            );
          }
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all duration-200 min-w-[60px]",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground active:scale-95"
              )}
            >
              <div className={cn(
                "relative p-2 rounded-xl transition-all duration-200",
                isActive && "bg-primary/15"
              )}>
                <Icon className={cn(
                  "h-6 w-6 transition-transform",
                  isActive && "scale-110"
                )} />
              </div>
              <span className={cn(
                "text-xs font-medium leading-tight font-hebrew",
                isActive ? "text-primary" : "text-muted-foreground"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
