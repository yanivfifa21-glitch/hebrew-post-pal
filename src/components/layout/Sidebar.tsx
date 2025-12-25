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
  TrendingUp,
  Sparkles
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
        "fixed left-0 top-0 z-40 h-screen flex-col hidden md:flex transition-all duration-300",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Glassmorphism Background */}
      <div className="absolute inset-0 bg-sidebar/80 backdrop-blur-2xl border-r border-sidebar-border" />
      
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
      
      <div className="relative flex flex-col h-full">
        {/* Logo */}
        <div className={cn(
          "flex items-center gap-3 p-5 border-b border-sidebar-border/50",
          collapsed && "justify-center px-3"
        )}>
          <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-secondary to-accent flex-shrink-0 shadow-glow-sm">
            <Zap className="h-5 w-5 text-primary-foreground" />
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/20 to-transparent animate-pulse-soft" />
          </div>
          {!collapsed && (
            <div className="flex flex-col animate-fade-in">
              <span className="font-bold text-lg text-foreground tracking-tight">AliAffilio</span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Automation Pro
              </span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto scrollbar-hide">
          {navItems.map((item, index) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden",
                  "animate-fade-in-up opacity-0",
                  isActive 
                    ? "bg-primary/15 text-primary shadow-glow-sm" 
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                )}
                style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'forwards' }}
              >
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-primary shadow-glow-sm" />
                )}
                
                <item.icon className={cn(
                  "h-5 w-5 transition-all duration-200 flex-shrink-0",
                  isActive ? "text-primary" : "text-sidebar-foreground group-hover:text-foreground group-hover:scale-110"
                )} />
                {!collapsed && (
                  <span className="font-medium text-sm">{item.label}</span>
                )}
                {isActive && !collapsed && (
                  <div className="ml-auto h-2 w-2 rounded-full bg-primary shadow-glow-sm animate-pulse-soft" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="p-3 border-t border-sidebar-border/50 space-y-3">
          {user && (
            <div className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl bg-sidebar-accent/30 backdrop-blur-sm",
              collapsed && "justify-center px-0"
            )}>
              <Avatar className="h-9 w-9 flex-shrink-0 ring-2 ring-primary/20 ring-offset-2 ring-offset-sidebar">
                <AvatarImage src={userAvatar} alt="User" />
                <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-xs font-bold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 min-w-0 animate-fade-in">
                  <p className="text-sm font-semibold text-foreground truncate">
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
              className={cn("flex-1 h-10", collapsed && "w-full")}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
            {!collapsed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="h-10 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
