import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  Plus, 
  List, 
  History, 
  Settings,
  TrendingUp,
  Menu,
  X,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const navItems = [
  { icon: LayoutDashboard, label: "דאשבורד", path: "/" },
  { icon: TrendingUp, label: "גילוי מוצרים", path: "/discovery" },
  { icon: Plus, label: "הוסף מוצר", path: "/add-product" },
  { icon: List, label: "תור פרסום", path: "/queue" },
  { icon: History, label: "היסטוריה", path: "/history" },
  { icon: Settings, label: "הגדרות", path: "/settings" },
];

function unlockScroll() {
  // Vaul/Radix can leave the page "scroll-locked" if navigation happens mid-transition.
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  document.body.removeAttribute("data-scroll-locked");

  document.documentElement.style.removeProperty("overflow");
  document.documentElement.style.removeProperty("padding-right");
  document.documentElement.removeAttribute("data-scroll-locked");
}

export const MobileNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Ensure navigation never leaves the app in a locked/no-scroll state on mobile.
  useEffect(() => {
    setOpen(false);
    requestAnimationFrame(unlockScroll);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) requestAnimationFrame(unlockScroll);
  }, [open]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({ title: "התנתקת בהצלחה" });
      setOpen(false);
      navigate("/auth");
    } catch (error) {
      toast({ title: "התנתקות נכשלה", variant: "destructive" });
    }
  };

  return (
    <div className="fixed top-0 right-0 z-[100] md:hidden p-4" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)' }}>
      <Drawer open={open} onOpenChange={setOpen} direction="right">
        <DrawerTrigger asChild>
          <Button 
            variant="outline" 
            size="icon" 
            className="h-12 w-12 rounded-xl bg-background/80 backdrop-blur-xl border-border/50 shadow-lg"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </DrawerTrigger>
        <DrawerContent className="h-full w-[280px] right-0 left-auto rounded-l-2xl rounded-r-none">
          <div className="flex flex-col h-full bg-background/95 backdrop-blur-xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <h2 className="text-lg font-semibold font-hebrew">תפריט</h2>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl">
                  <X className="h-5 w-5" />
                </Button>
              </DrawerClose>
            </div>
            
            {/* Navigation Items */}
            <nav className="flex-1 p-4 space-y-2">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 font-hebrew",
                      isActive 
                        ? "bg-primary/15 text-primary border border-primary/20" 
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground active:scale-[0.98]"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-lg transition-all",
                      isActive 
                        ? "bg-primary/20" 
                        : "bg-muted/50"
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-base font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            
            {/* Footer */}
            <div className="p-4 border-t border-border/50 space-y-3">
              <Button 
                variant="ghost" 
                className="w-full justify-start gap-4 px-4 py-3 text-destructive hover:text-destructive hover:bg-destructive/10 font-hebrew"
                onClick={handleLogout}
              >
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-destructive/10">
                  <LogOut className="h-5 w-5" />
                </div>
                <span className="text-base font-medium">התנתק</span>
              </Button>
              <p className="text-xs text-muted-foreground text-center font-hebrew">
                AliExpress Affiliate Manager
              </p>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};
