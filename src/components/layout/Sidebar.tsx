import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  Plus, 
  List, 
  History, 
  Settings, 
  Zap,
  ChevronLeft,
  ChevronRight,
  LogOut,
  TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: TrendingUp, label: "Discovery", path: "/discovery" },
  { icon: Plus, label: "Add Product", path: "/add-product" },
  { icon: List, label: "Queue", path: "/queue" },
  { icon: History, label: "History", path: "/history" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({ title: "Logged out" });
      navigate("/auth");
    } catch (error) {
      toast({ title: "Logout failed", variant: "destructive" });
    }
  };

  const userInitials = user?.email?.substring(0, 2).toUpperCase() || "U";
  const userAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 z-40 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary">
          <Zap className="h-5 w-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="flex flex-col animate-slide-in">
            <span className="font-bold text-foreground">AliAffilio</span>
            <span className="text-xs text-muted-foreground">Automation Pro</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group",
                isActive 
                  ? "bg-sidebar-accent text-sidebar-primary border border-sidebar-primary/30" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
              )}
            >
              <item.icon className={cn(
                "h-5 w-5 transition-colors",
                isActive ? "text-sidebar-primary" : "text-sidebar-foreground group-hover:text-foreground"
              )} />
              {!collapsed && (
                <span className="font-medium animate-slide-in">{item.label}</span>
              )}
              {isActive && !collapsed && (
                <div className="ml-auto h-2 w-2 rounded-full bg-sidebar-primary animate-pulse-glow" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Section */}
      <div className="p-3 border-t border-sidebar-border space-y-2">
        {user && (
          <div className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg bg-sidebar-accent/50",
            collapsed && "justify-center px-0"
          )}>
            <Avatar className="h-8 w-8">
              <AvatarImage src={userAvatar} alt="User" />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user.user_metadata?.full_name || user.email?.split("@")[0]}
                </p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className={cn("flex-1", collapsed && "w-full")}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
          {!collapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
};
