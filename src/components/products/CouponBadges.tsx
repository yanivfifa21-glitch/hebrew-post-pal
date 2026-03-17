import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ticket, RefreshCw } from "lucide-react";
import { detectCouponsInText, DetectedCouponSlot, findBestCoupon, detectReferencePrice, Coupon } from "@/lib/couponUtils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface CouponBadgesProps {
  text: string;
  onTextUpdated?: (newText: string) => void;
  compact?: boolean;
}

export function CouponBadges({ text, onTextUpdated, compact = false }: CouponBadgesProps) {
  const [isReplacing, setIsReplacing] = useState(false);
  const detected = detectCouponsInText(text);

  if (detected.length === 0) return null;

  const storeCoupon = detected.length >= 2 ? detected[0] : null;
  const affiliateCoupon = detected.length >= 2 ? detected[1] : detected[0];

  const handleReplaceCoupon = async () => {
    if (!onTextUpdated) return;
    setIsReplacing(true);
    try {
      const { data: campaign } = await supabase
        .from("coupon_campaigns")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!campaign || !campaign.coupons) {
        toast({ title: "אין קמפיין קופונים פעיל", variant: "destructive" });
        return;
      }

      const coupons = campaign.coupons as unknown as Coupon[];
      const exchangeRate = Number(campaign.exchange_rate) || 3.19;
      const { priceUsd } = detectReferencePrice(text, exchangeRate);

      if (!priceUsd) {
        toast({ title: "לא נמצא מחיר בטקסט", variant: "destructive" });
        return;
      }

      const best = findBestCoupon(priceUsd, coupons);
      if (!best) {
        toast({ title: `מחיר $${priceUsd} - אין קופון מתאים`, variant: "destructive" });
        return;
      }

      // Replace only the affiliate coupon (slot 2, or slot 1 if single)
      const codeToReplace = affiliateCoupon.code;
      const newCode = detected.length >= 2 ? (best.code2 || best.code) : best.code;
      
      if (codeToReplace === newCode) {
        toast({ title: "הקופון כבר מעודכן ✅" });
        return;
      }

      const regex = new RegExp(codeToReplace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const newText = text.replace(regex, newCode);
      onTextUpdated(newText);
      toast({ title: `✅ קופון הוחלף: ${codeToReplace} → ${newCode}` });
    } catch {
      toast({ title: "שגיאה בהחלפת קופון", variant: "destructive" });
    } finally {
      setIsReplacing(false);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? 'text-[10px]' : 'text-xs'}`} dir="rtl">
      <Ticket className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-muted-foreground flex-shrink-0`} />
      {storeCoupon && (
        <Badge variant="outline" className={`font-mono ${compact ? 'text-[10px] px-1.5 py-0' : 'text-xs'} border-muted-foreground/30`}>
          ①  {storeCoupon.code}
          <span className="text-muted-foreground mr-1">(חנות)</span>
        </Badge>
      )}
      <Badge variant="secondary" className={`font-mono ${compact ? 'text-[10px] px-1.5 py-0' : 'text-xs'}`}>
        {detected.length >= 2 ? '②' : '①'} {affiliateCoupon.code}
        <span className="text-muted-foreground mr-1">(שותפים)</span>
      </Badge>
      {onTextUpdated && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReplaceCoupon}
          disabled={isReplacing}
          className={`${compact ? 'h-5 text-[10px] px-1.5' : 'h-6 text-xs px-2'} gap-1 text-primary hover:text-primary`}
        >
          <RefreshCw className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} ${isReplacing ? 'animate-spin' : ''}`} />
          החלף קופון
        </Button>
      )}
    </div>
  );
}
