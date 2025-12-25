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
  { icon: Plus, label: "הוסף", path: "/add-product" },
  { icon: List, label: "תור", path: "/queue" },
  { icon: History, label: "היסטוריה", path: "/history" },
];

export const MobileNav = () => {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-sidebar/95 backdrop-blur-lg border-t border-sidebar-border md:hidden safe-area-bottom">
      <div className="flex items-center justify-around py-2 px-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-200 min-w-[60px]",
                isActive 
                  ? "text-sidebar-primary bg-sidebar-accent" 
                  : "text-sidebar-foreground active:scale-95"
              )}
            >
              <item.icon className={cn(
                "h-5 w-5 transition-transform",
                isActive && "scale-110"
              )} />
              <span className="text-[10px] font-medium leading-tight">{item.label}</span>
            </Link>
          );
        })}
        {/* Settings as last item */}
        <Link
          to="/settings"
          className={cn(
            "flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-200 min-w-[60px]",
            location.pathname === "/settings" 
              ? "text-sidebar-primary bg-sidebar-accent" 
              : "text-sidebar-foreground active:scale-95"
          )}
        >
          <Settings className={cn(
            "h-5 w-5 transition-transform",
            location.pathname === "/settings" && "scale-110"
          )} />
          <span className="text-[10px] font-medium leading-tight">הגדרות</span>
        </Link>
      </div>
    </nav>
  );
};
