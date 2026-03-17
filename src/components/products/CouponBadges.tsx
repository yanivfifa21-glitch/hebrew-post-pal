import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ticket, RefreshCw, Trash2 } from "lucide-react";
import { detectCouponsInText, DetectedCouponSlot, findBestCoupon, detectReferencePrice, Coupon } from "@/lib/couponUtils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface CouponBadgesProps {
  text: string;
  onTextUpdated?: (newText: string) => void;
  compact?: boolean;
}

/**
 * Remove a coupon code from text, including the surrounding context line
 * (e.g. "🎟️ יש להזין קופון: CODE1 / CODE2" or "קוד הנחה: CODE")
 */
function removeCouponFromText(text: string, codeToRemove: string, otherCode?: string): string {
  const escaped = codeToRemove.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let newText = text;

  // Try to remove the code with surrounding separators like " / CODE" or "CODE / "
  const withSepAfter = new RegExp(`\\s*[/|,]\\s*${escaped}`, 'gi');
  const withSepBefore = new RegExp(`${escaped}\\s*[/|,]\\s*`, 'gi');

  if (otherCode) {
    // There's another coupon on the same line - just remove this code + separator
    if (withSepAfter.test(newText)) {
      newText = newText.replace(withSepAfter, '');
    } else if (withSepBefore.test(newText)) {
      newText = newText.replace(withSepBefore, '');
    } else {
      // Fallback: just remove the code itself
      newText = newText.replace(new RegExp(escaped, 'gi'), '');
    }
  } else {
    // Only coupon - remove the entire coupon line(s)
    const lines = newText.split('\n');
    const couponLineKeywords = /(?:קופון|קוד|coupon|code|הנחה)/i;
    const filteredLines = lines.filter(line => {
      if (new RegExp(escaped, 'i').test(line) && couponLineKeywords.test(line)) {
        return false; // Remove this line
      }
      return true;
    });
    newText = filteredLines.join('\n');
    
    // Clean up double blank lines
    newText = newText.replace(/\n{3,}/g, '\n\n');
  }

  return newText.trim();
}

export function CouponBadges({ text, onTextUpdated, compact = false }: CouponBadgesProps) {
  const [isReplacing, setIsReplacing] = useState(false);
  const detected = detectCouponsInText(text);

  if (detected.length === 0) return null;

  const storeCoupon = detected.length >= 2 ? detected[0] : null;
  const affiliateCoupon = detected.length >= 2 ? detected[1] : detected[0];

  const handleDeleteCoupon = (slot: DetectedCouponSlot) => {
    if (!onTextUpdated) return;
    const otherCode = detected.find(d => d.code !== slot.code)?.code;
    const newText = removeCouponFromText(text, slot.code, otherCode);
    onTextUpdated(newText);
    toast({ title: `🗑️ קופון ${slot.code} נמחק מהפוסט` });
  };

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

  const badgeSize = compact ? 'text-[10px] px-1.5 py-0' : 'text-xs';
  const trashSize = compact ? 'h-2.5 w-2.5' : 'h-3 w-3';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? 'text-[10px]' : 'text-xs'}`} dir="rtl">
      <Ticket className={`${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} text-muted-foreground flex-shrink-0`} />
      {storeCoupon && (
        <Badge variant="outline" className={`font-mono ${badgeSize} border-muted-foreground/30 gap-1`}>
          ① {storeCoupon.code}
          <span className="text-muted-foreground">(חנות)</span>
          {onTextUpdated && (
            <Trash2
              className={`${trashSize} text-destructive/60 hover:text-destructive cursor-pointer mr-0.5`}
              onClick={(e) => { e.stopPropagation(); handleDeleteCoupon(storeCoupon); }}
            />
          )}
        </Badge>
      )}
      <Badge variant="secondary" className={`font-mono ${badgeSize} gap-1`}>
        {detected.length >= 2 ? '②' : '①'} {affiliateCoupon.code}
        <span className="text-muted-foreground">(שותפים)</span>
        {onTextUpdated && (
          <Trash2
            className={`${trashSize} text-destructive/60 hover:text-destructive cursor-pointer mr-0.5`}
            onClick={(e) => { e.stopPropagation(); handleDeleteCoupon(affiliateCoupon); }}
          />
        )}
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
