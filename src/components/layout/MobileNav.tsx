import { useEffect, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  Plus, 
  List, 
  History, 
  Settings,
  TrendingUp,
  Menu,
  X,
  LogOut,
  Send,
  MapPin,
  Search,
  Ticket,
  LayoutGrid,
  Headphones
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const navItems = [
  { icon: LayoutDashboard, label: "דאשבורד", path: "/" },
  { icon: TrendingUp, label: "גילוי מוצרים", path: "/discovery" },
  { icon: Search, label: "חיפוש חופשי", path: "/free-search" },
  { icon: Plus, label: "הוסף מוצר", path: "/add-product" },
  { icon: Send, label: "שליחה ידנית", path: "/manual-send" },
  { icon: List, label: "תור פרסום", path: "/queue" },
  { icon: MapPin, label: "אזורים", path: "/zones" },
  { icon: Ticket, label: "קופונים", path: "/coupons" },
  { icon: LayoutGrid, label: "יוצר קולאז׳", path: "/collage" },
  { icon: History, label: "היסטוריה", path: "/history" },
  { icon: Settings, label: "הגדרות", path: "/settings" },
];

function unlockScroll() {
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  document.body.style.removeProperty("padding-left");
  document.body.removeAttribute("data-scroll-locked");
  document.documentElement.style.removeProperty("overflow");
  document.documentElement.style.removeProperty("padding-right");
  document.documentElement.style.removeProperty("padding-left");
  document.documentElement.removeAttribute("data-scroll-locked");
}

export const MobileNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setTimeout(unlockScroll, 50);
    requestAnimationFrame(unlockScroll);
  }, []);

  // Close menu on route change
  useEffect(() => {
    closeMenu();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unlock scroll whenever menu closes
  useEffect(() => {
    if (!open) {
      setTimeout(unlockScroll, 150);
    }
  }, [open]);

  const handleNavClick = useCallback((path: string) => {
    setOpen(false);
    unlockScroll();
    navigate(path);
    setTimeout(unlockScroll, 100);
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({ title: "התנתקת בהצלחה" });
      closeMenu();
      navigate("/auth");
    } catch (error) {
      toast({ title: "התנתקות נכשלה", variant: "destructive" });
    }
  };

  return (
    <>
      {/* Menu trigger button - top right */}
      <div
        className="fixed top-0 right-0 z-[100] md:hidden p-4"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 16px)' }}
      >
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-xl bg-background/80 backdrop-blur-xl border-border/50 shadow-lg"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-6 w-6" />
        </Button>
      </div>

      {/* Backdrop overlay - touch/click outside to close */}
      {open && (
        <div
          className="fixed inset-0 z-[110] bg-black/30 md:hidden"
          onClick={closeMenu}
          onTouchStart={(e) => { e.preventDefault(); closeMenu(); }}
        />
      )}

      {/* Sidebar panel sliding from right */}
      <div
        className={cn(
          "fixed top-0 right-0 z-[120] h-full w-[280px] md:hidden",
          "bg-background shadow-2xl border-l border-border/50",
          "flex flex-col transition-transform duration-300 ease-in-out will-change-transform"
        )}
        style={{
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <h2 className="text-lg font-semibold font-hebrew">תפריט</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl"
            onClick={closeMenu}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-150 font-hebrew text-right",
                  isActive
                    ? "bg-primary/15 text-primary border border-primary/20"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground active:bg-muted/70"
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-lg transition-all flex-shrink-0",
                    isActive ? "bg-primary/20" : "bg-muted/50"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-base font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div
          className="p-4 border-t border-border/50 space-y-3"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
        >
          <Button
            variant="ghost"
            className="w-full justify-start gap-4 px-4 py-3 text-destructive hover:text-destructive hover:bg-destructive/10 font-hebrew"
            onClick={handleLogout}
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-destructive/10 flex-shrink-0">
              <LogOut className="h-5 w-5" />
            </div>
            <span className="text-base font-medium">התנתק</span>
          </Button>
          <p className="text-xs text-muted-foreground text-center font-hebrew">
            AliExpress Affiliate Manager
          </p>
        </div>
      </div>
    </>
  );
};
