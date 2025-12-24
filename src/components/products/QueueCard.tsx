import { useState } from "react";
import { Product } from "@/types/product";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Rocket, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface QueueCardProps {
  product: Product;
  onSent: (productId: string) => void;
  onDeleted: (productId: string) => void;
}

export const QueueCard = ({ product, onSent, onDeleted }: QueueCardProps) => {
  const [hebrewDescription, setHebrewDescription] = useState(product.hebrew_description || "");
  const [isSending, setIsSending] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSendNow = async () => {
    setIsSending(true);
    try {
      // Get settings to check which channels are enabled
      const { data: settings } = await supabase
        .from("app_settings")
        .select("telegram_enabled, whatsapp_enabled")
        .limit(1)
        .maybeSingle();

      const channels: string[] = [];

      if (settings?.whatsapp_enabled) {
        const { data, error } = await supabase.functions.invoke("send-whatsapp", {
          body: {
            title: product.title,
            hebrewDescription,
            price: product.price,
            imageUrl: product.image_url,
            affiliateLink: product.affiliate_link,
          },
        });
        if (error) throw new Error(`WhatsApp: ${error.message}`);
        if (!data?.success) throw new Error(`WhatsApp: ${data?.error || "Failed"}`);
        channels.push("whatsapp");
      }

      if (settings?.telegram_enabled) {
        const { data, error } = await supabase.functions.invoke("send-telegram", {
          body: {
            title: product.title,
            hebrewDescription,
            price: product.price,
            imageUrl: product.image_url,
            affiliateLink: product.affiliate_link,
          },
        });
        if (error) throw new Error(`Telegram: ${error.message}`);
        if (!data?.success) throw new Error(`Telegram: ${data?.error || "Failed"}`);
        channels.push("telegram");
      }

      if (channels.length === 0) {
        toast({
          title: "No Channels Enabled",
          description: "Enable WhatsApp or Telegram in Settings first.",
          variant: "destructive",
        });
        return;
      }

      // Update product status to 'sent'
      await supabase
        .from("products")
        .update({ 
          status: "sent", 
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

  return (
    <div className="glass-card neon-border overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-4 p-4">
        {/* Thumbnail */}
        <div className="w-full sm:w-32 h-32 flex-shrink-0 rounded-lg overflow-hidden border border-border">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <span className="text-muted-foreground text-xs">No Image</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col gap-3">
          <h3 className="font-semibold text-foreground line-clamp-2">{product.title}</h3>

          {/* Editable Hebrew Description */}
          <Textarea
            value={hebrewDescription}
            onChange={(e) => setHebrewDescription(e.target.value)}
            className="min-h-[120px] text-sm text-right"
            dir="rtl"
            placeholder="Hebrew description..."
          />

          {/* Action Buttons */}
          <div className="flex gap-2 mt-auto">
            <Button
              variant="gradient"
              className="flex-1"
              onClick={handleSendNow}
              disabled={isSending || isDeleting}
            >
              {isSending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Send Now
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleDelete}
              disabled={isSending || isDeleting}
              className="text-destructive hover:bg-destructive/10"
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
