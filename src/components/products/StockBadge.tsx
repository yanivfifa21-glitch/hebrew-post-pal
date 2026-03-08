import { useState } from "react";
import { Product } from "@/types/product";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, PackageCheck, PackageX, AlertTriangle, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface StockBadgeProps {
  product: Product;
  onStockChecked?: (productId: string, status: string) => void;
  showCheckButton?: boolean;
}

export const StockBadge = ({ product, onStockChecked, showCheckButton = true }: StockBadgeProps) => {
  const [isChecking, setIsChecking] = useState(false);
  const stockStatus = product.stock_status || "unchecked";

  const handleCheckStock = async (e: React.MouseEvent) => {
    e.stopPropagation();

    const checkUrl = product.affiliate_link || product.original_url;
    const isValidHttpUrl = (() => {
      if (!checkUrl) return false;
      try {
        const parsed = new URL(checkUrl);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    })();

    if (!isValidHttpUrl) {
      toast({ title: "אין קישור תקין לבדיקה", description: "הוסף קישור מוצר מלא לפני בדיקת מלאי" });
      return;
    }

    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-product-stock", {
        body: { productId: product.id, url: checkUrl },
      });
      if (error) throw error;
      onStockChecked?.(product.id, data.status);
      toast({
        title:
          data.status === "available"
            ? "✅ במלאי"
            : data.status === "unavailable"
              ? "❌ אזל מהמלאי"
              : data.status === "unchecked"
                ? "⚪ לא נבדק"
                : "⚠️ שגיאה בבדיקה",
      });
    } catch {
      toast({ title: "שגיאה בבדיקת מלאי", variant: "destructive" });
    } finally {
      setIsChecking(false);
    }
  };

  const getBadge = () => {
    switch (stockStatus) {
      case "available":
        return (
          <Badge variant="default" className="bg-success/20 text-success border-success/30 gap-1">
            <PackageCheck className="h-3 w-3" />
            במלאי
          </Badge>
        );
      case "unavailable":
        return (
          <Badge variant="destructive" className="gap-1">
            <PackageX className="h-3 w-3" />
            אזל מהמלאי
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="border-warning/50 text-warning gap-1">
            <AlertTriangle className="h-3 w-3" />
            שגיאה
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground gap-1">
            <HelpCircle className="h-3 w-3" />
            לא נבדק
          </Badge>
        );
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {getBadge()}
      {product.last_stock_check && (
        <span className="text-[10px] text-muted-foreground">
          {format(new Date(product.last_stock_check), "dd/MM HH:mm")}
        </span>
      )}
      {showCheckButton && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCheckStock}
          disabled={isChecking}
          className="h-6 px-2 text-xs"
        >
          {isChecking ? <Loader2 className="h-3 w-3 animate-spin" /> : "בדוק"}
        </Button>
      )}
    </div>
  );
};
