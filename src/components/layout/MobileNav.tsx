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
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden safe-area-bottom">
      {/* Glassmorphism background */}
      <div className="absolute inset-0 bg-sidebar/90 backdrop-blur-xl border-t border-sidebar-border/50" />
      
      {/* Gradient accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      
      <div className="relative flex items-end justify-around px-2 pt-2 pb-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          
          // Main action button (Add)
          if (item.isMain) {
            return (
              <Link
                key={item.path}
                to={item.path}
                className="relative -mt-5"
              >
                <div className={cn(
                  "flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all duration-300",
                  "bg-gradient-to-br from-primary via-secondary to-accent shadow-glow-md",
                  isActive && "scale-110"
                )}>
                  <Icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <span className={cn(
                  "text-[10px] font-semibold mt-1 block text-center font-hebrew transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          }
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all duration-200 min-w-[56px]",
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
                  "h-5 w-5 transition-transform",
                  isActive && "scale-110"
                )} />
                {isActive && (
                  <div className="absolute inset-0 rounded-xl bg-primary/10 animate-pulse-soft" />
                )}
              </div>
              <span className={cn(
                "text-[10px] font-semibold leading-tight font-hebrew",
                isActive && "text-primary"
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
