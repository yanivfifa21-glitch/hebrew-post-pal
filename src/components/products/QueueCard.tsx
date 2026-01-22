import { useState } from "react";
import { Product } from "@/types/product";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Rocket, Trash2, Loader2, ExternalLink, Star, ShoppingCart, Copy, Check, Clock } from "lucide-react";
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
}

export const QueueCard = ({ product, onSent, onDeleted, isSelected = false, onSelectionChange, showCheckbox = false }: QueueCardProps) => {
  const [hebrewDescription, setHebrewDescription] = useState(product.hebrew_description || "");
  const [isSending, setIsSending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

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
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.title}
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
              ${product.price?.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-5 flex flex-col gap-4">
          {/* Header */}
          <div className="space-y-2">
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
          </div>

          {/* Editable Hebrew Description */}
          <div className="relative">
            <Textarea
              value={hebrewDescription}
              onChange={(e) => setHebrewDescription(e.target.value)}
              className="min-h-[120px] text-sm text-right font-hebrew bg-muted/30 border-border/50 focus:border-primary/50 resize-none pr-10"
              dir="rtl"
              placeholder="תיאור בעברית..."
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopyToClipboard}
              className="absolute top-2 left-2 h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Copy to clipboard"
            >
              {isCopied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mt-auto">
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
            <Button
              variant="ghost-destructive"
              size="icon"
              onClick={handleDelete}
              disabled={isSending || isDeleting}
              className="flex-shrink-0"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
