import { useState } from "react";
import { Product } from "@/types/product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { StockBadge } from "@/components/products/StockBadge";
import { Rocket, Trash2, Loader2, ExternalLink, Star, ShoppingCart, Copy, Check, Clock, RotateCcw, Edit, Save, X, Ticket } from "lucide-react";
import { detectCouponsInText, DetectedCouponSlot } from "@/lib/couponUtils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface QueueCardProps {
  product: Product;
  onSent: (productId: string) => void;
  onDeleted: (productId: string) => void;
  onStatusChanged?: (productId: string, newStatus: string) => void;
  isSelected?: boolean;
  onSelectionChange?: (productId: string, selected: boolean) => void;
  showCheckbox?: boolean;
  onStockChecked?: (productId: string, status: string) => void;
}

export const QueueCard = ({ product, onSent, onDeleted, onStatusChanged, isSelected = false, onSelectionChange, showCheckbox = false, onStockChecked }: QueueCardProps) => {
  const [hebrewDescription, setHebrewDescription] = useState(product.hebrew_description || "");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const detectedCoupons: DetectedCouponSlot[] = detectCouponsInText(hebrewDescription);
  const [isSending, setIsSending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReturning, setIsReturning] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editTitle, setEditTitle] = useState(product.title);
  const [editPrice, setEditPrice] = useState(product.price?.toString() || "");
  const [editAffiliateLink, setEditAffiliateLink] = useState(product.affiliate_link || "");
  const [editImageUrl, setEditImageUrl] = useState(product.image_url || "");

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({
          title: editTitle,
          price: editPrice ? parseFloat(editPrice) : null,
          affiliate_link: editAffiliateLink || null,
          image_url: editImageUrl || null,
          hebrew_description: hebrewDescription,
        })
        .eq("id", product.id);

      if (error) throw error;
      product.title = editTitle;
      product.price = editPrice ? parseFloat(editPrice) : null;
      product.affiliate_link = editAffiliateLink || null;
      product.image_url = editImageUrl || null;
      product.hebrew_description = hebrewDescription;
      setIsEditing(false);
      toast({ title: "✅ נשמר בהצלחה!" });
    } catch {
      toast({ title: "שמירה נכשלה", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditTitle(product.title);
    setEditPrice(product.price?.toString() || "");
    setEditAffiliateLink(product.affiliate_link || "");
    setEditImageUrl(product.image_url || "");
    setHebrewDescription(product.hebrew_description || "");
    setIsEditing(false);
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(hebrewDescription);
      setIsCopied(true);
      toast({ title: "Copied!", description: "Text copied to clipboard" });
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleSendNow = async () => {
    setIsSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get active messaging accounts (not app_settings)
      const { data: accounts } = await supabase
        .rpc("get_my_messaging_accounts_safe");

      const activeWhatsApp = accounts?.filter(
        (acc: any) => acc.account_type === "whatsapp" && acc.is_active && acc.has_api_token && acc.has_instance_id
      ) || [];
      
      const activeTelegram = accounts?.filter(
        (acc: any) => acc.account_type === "telegram" && acc.is_active && acc.has_bot_token && acc.telegram_chat_id
      ) || [];

      const channels: string[] = [];
      const errors: string[] = [];

      // Send to all active WhatsApp accounts
      for (const acc of activeWhatsApp) {
        try {
          const { data, error } = await supabase.functions.invoke("send-whatsapp", {
            body: {
              title: product.title,
              hebrewDescription,
              price: product.price,
              imageUrl: product.image_url,
              affiliateLink: product.affiliate_link,
              userId: user.id,
              accountId: acc.id,
            },
          });
          if (error) throw new Error(error.message);
          if (!data?.success) throw new Error(data?.error || "Failed");
          if (!channels.includes("whatsapp")) channels.push("whatsapp");
        } catch (e) {
          errors.push(`WhatsApp (${acc.account_name}): ${e instanceof Error ? e.message : "Failed"}`);
        }
      }

      // Send to all active Telegram accounts
      for (const acc of activeTelegram) {
        try {
          const { data, error } = await supabase.functions.invoke("send-telegram", {
            body: {
              title: product.title,
              hebrewDescription,
              price: product.price,
              imageUrl: product.image_url,
              affiliateLink: product.affiliate_link,
              userId: user.id,
              accountId: acc.id,
            },
          });
          if (error) throw new Error(error.message);
          if (!data?.success) throw new Error(data?.error || "Failed");
          if (!channels.includes("telegram")) channels.push("telegram");
        } catch (e) {
          errors.push(`Telegram (${acc.account_name}): ${e instanceof Error ? e.message : "Failed"}`);
        }
      }

      if (channels.length === 0 && activeWhatsApp.length === 0 && activeTelegram.length === 0) {
        toast({
          title: "אין ערוצים פעילים",
          description: "הוסף חשבון WhatsApp או Telegram פעיל עם credentials בהגדרות.",
          variant: "destructive",
        });
        return;
      }

      if (channels.length === 0 && errors.length > 0) {
        throw new Error(errors.join("; "));
      }

      await supabase
        .from("products")
        .update({ 
          status: "Sent", 
          sent_via: "manual",
          channels,
          hebrew_description: hebrewDescription 
        })
        .eq("id", product.id);

      toast({
        title: "✅ Sent Successfully!",
        description: `Posted to ${channels.join(" & ")}`,
      });

      onSent(product.id);
    } catch (error) {
      toast({
        title: "Send Failed",
        description: error instanceof Error ? error.message : "Could not send post.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const { error } = await supabase.from("products").delete().eq("id", product.id);
      if (error) throw error;

      toast({ title: "Product deleted" });
      onDeleted(product.id);
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReturnToQueue = async () => {
    setIsReturning(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ status: "Scheduled" })
        .eq("id", product.id);

      if (error) throw error;

      toast({ 
        title: "חזר לתור!",
        description: "המוצר הועבר בחזרה לתור השליחה"
      });
      onStatusChanged?.(product.id, "Scheduled");
    } catch {
      toast({ title: "Failed to return to queue", variant: "destructive" });
    } finally {
      setIsReturning(false);
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Scheduled': return 'scheduled';
      case 'Sent': return 'sent';
      case 'processing': return 'queued';
      default: return 'scheduled';
    }
  };

  return (
    <div className="glass-card card-interactive overflow-hidden animate-fade-in-up">
      <div className="flex flex-col md:flex-row">
        {/* Checkbox for selection */}
        {showCheckbox && (
          <div className="absolute top-3 right-3 z-10">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelectionChange?.(product.id, checked === true)}
              className="h-5 w-5 bg-background/80 backdrop-blur-sm border-2"
            />
          </div>
        )}
        {/* Product Image */}
        <div className="relative w-full md:w-44 h-44 flex-shrink-0 overflow-hidden">
          {(isEditing ? editImageUrl : product.image_url) ? (
            <img
              src={isEditing ? editImageUrl : product.image_url!}
              alt={isEditing ? editTitle : product.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <span className="text-muted-foreground text-sm">No Image</span>
            </div>
          )}
          
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
          
          {/* Status Badge */}
          <div className="absolute top-3 left-3">
            <Badge variant={getStatusVariant(product.status)} className="capitalize shadow-lg">
              {product.status}
            </Badge>
          </div>
          
          {/* Price Badge */}
          <div className="absolute bottom-3 left-3">
            <div className="bg-primary/90 backdrop-blur-sm text-primary-foreground px-3 py-1.5 rounded-lg font-bold text-sm shadow-glow-sm">
              ${isEditing ? (parseFloat(editPrice) || 0).toFixed(2) : product.price?.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-5 flex flex-col gap-4">
          {/* Header */}
          <div className="space-y-2">
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">כותרת</Label>
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">מחיר ($)</Label>
                    <Input type="number" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">קישור שותף</Label>
                  <Input value={editAffiliateLink} onChange={(e) => setEditAffiliateLink(e.target.value)} className="mt-1" dir="ltr" />
                </div>
                <div>
                  <Label className="text-xs">קישור תמונה</Label>
                  <Input value={editImageUrl} onChange={(e) => setEditImageUrl(e.target.value)} className="mt-1" dir="ltr" placeholder="https://..." />
                </div>
              </div>
            ) : (
              <>
                <h3 className="font-semibold text-foreground line-clamp-2 text-base leading-snug">
                  {product.title}
                </h3>
                
                {/* Stats Row */}
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  {product.rating && product.rating > 0 && (
                    <div className="flex items-center gap-1.5 text-warning">
                      <Star className="h-4 w-4 fill-current" />
                      <span className="font-medium">{product.rating.toFixed(1)}</span>
                    </div>
                  )}
                  {product.orders_count && product.orders_count > 0 && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <ShoppingCart className="h-4 w-4" />
                      <span>{product.orders_count.toLocaleString()} sold</span>
                    </div>
                  )}
                  {product.scheduled_time && (
                    <div className="flex items-center gap-1.5 text-primary">
                      <Clock className="h-4 w-4" />
                      <span className="font-medium">
                        {format(new Date(product.scheduled_time), 'MMM dd, HH:mm')}
                      </span>
                    </div>
                  )}
                  {product.affiliate_link && (
                    <a 
                      href={product.affiliate_link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span className="text-xs">Link</span>
                    </a>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Stock Status Badge */}
          <StockBadge product={product} onStockChecked={onStockChecked} />

          {/* Detected Coupons Display */}
          {detectedCoupons.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs" dir="rtl">
              <Ticket className="h-3.5 w-3.5 text-muted-foreground" />
              {detectedCoupons.length === 1 ? (
                <Badge variant="secondary" className="font-mono text-xs">
                  קופון: {detectedCoupons[0].code}
                  <span className="text-muted-foreground mr-1">(יוחלף)</span>
                </Badge>
              ) : (
                <>
                  <Badge variant="outline" className="font-mono text-xs border-muted-foreground/30">
                    קופון 1: {detectedCoupons[0].code}
                    <span className="text-muted-foreground mr-1">(חנות - נשאר)</span>
                  </Badge>
                  <Badge variant="secondary" className="font-mono text-xs">
                    קופון 2: {detectedCoupons[1].code}
                    <span className="text-muted-foreground mr-1">(יוחלף)</span>
                  </Badge>
                </>
              )}
            </div>
          )}
          {/* Editable Hebrew Description */}
          <div className="relative">
            <Textarea
              value={hebrewDescription}
              onChange={(e) => {
                setHebrewDescription(e.target.value);
                if (e.target.value !== (product.hebrew_description || "")) {
                  setHasUnsavedChanges(true);
                } else {
                  setHasUnsavedChanges(false);
                }
              }}
              className="min-h-[120px] text-sm text-right font-hebrew bg-muted/30 border-border/50 focus:border-primary/50 resize-none pr-10"
              dir="rtl"
              placeholder="תיאור בעברית..."
            />
            <div className="absolute top-2 left-2 flex gap-1">
              {hasUnsavedChanges && !isEditing && (
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={async () => {
                    setIsSaving(true);
                    try {
                      const { error } = await supabase
                        .from("products")
                        .update({ hebrew_description: hebrewDescription })
                        .eq("id", product.id);
                      if (error) throw error;
                      product.hebrew_description = hebrewDescription;
                      setHasUnsavedChanges(false);
                      toast({ title: "✅ נשמר!" });
                    } catch {
                      toast({ title: "שמירה נכשלה", variant: "destructive" });
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  disabled={isSaving}
                  className="h-7 text-xs"
                >
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                  שמור
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyToClipboard}
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Copy to clipboard"
              >
                {isCopied ? (
                  <Check className="h-4 w-4 text-success" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-auto">
            {isEditing ? (
              <>
                <Button
                  variant="gradient"
                  className="flex-1"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  שמור
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                >
                  <X className="h-4 w-4 mr-1" />
                  ביטול
                </Button>
              </>
            ) : (
              <>
                {product.status === "Sent" ? (
                  <Button
                    variant="outline"
                    className="flex-1 border-primary/50 text-primary hover:bg-primary/10"
                    onClick={handleReturnToQueue}
                    disabled={isReturning || isDeleting}
                  >
                    {isReturning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>מחזיר...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4" />
                        <span>החזר לתור</span>
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="success"
                    className="flex-1 btn-glow-success"
                    onClick={handleSendNow}
                    disabled={isSending || isDeleting}
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Rocket className="h-4 w-4" />
                        <span>Send Now</span>
                      </>
                    )}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsEditing(true)}
                  className="flex-shrink-0"
                  title="ערוך"
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost-destructive"
                  size="icon"
                  onClick={handleDelete}
                  disabled={isSending || isDeleting || isReturning}
                  className="flex-shrink-0"
                >
                  {isDeleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
