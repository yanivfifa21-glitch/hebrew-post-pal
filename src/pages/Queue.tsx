import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { ProductCard } from "@/components/products/ProductCard";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types/product";
import { toast } from "@/hooks/use-toast";
import { sendToTelegram, sendToWhatsApp } from "@/lib/mockApi";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { List, Clock, Send } from "lucide-react";

const Queue = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<{ telegram_enabled: boolean; whatsapp_enabled: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, settingsRes] = await Promise.all([
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('app_settings').select('*').limit(1).single()
      ]);

      if (productsRes.error) throw productsRes.error;
      setProducts(productsRes.data as Product[]);

      if (settingsRes.data) {
        setSettings({
          telegram_enabled: settingsRes.data.telegram_enabled,
          whatsapp_enabled: settingsRes.data.whatsapp_enabled
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePostNow = async (product: Product) => {
    try {
      const channels: string[] = [];
      
      if (settings?.telegram_enabled) {
        await sendToTelegram(product);
        channels.push('telegram');
      }
      
      if (settings?.whatsapp_enabled) {
        await sendToWhatsApp(product);
        channels.push('whatsapp');
      }

      if (channels.length === 0) {
        toast({
          title: "No Channels Enabled",
          description: "Please enable Telegram or WhatsApp in Settings.",
          variant: "destructive",
        });
        return;
      }

      await supabase
        .from('products')
        .update({ status: 'sent', channels })
        .eq('id', product.id);

      toast({
        title: "Success!",
        description: `Posted to ${channels.join(' & ')}`,
      });

      fetchData();
    } catch (error) {
      toast({
        title: "Failed to post",
        description: "An error occurred while posting.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (product: Product) => {
    try {
      await supabase.from('products').delete().eq('id', product.id);
      toast({ title: "Product deleted" });
      fetchData();
    } catch (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const queuedProducts = products.filter(p => p.status === 'queued');
  const scheduledProducts = products.filter(p => p.status === 'scheduled');
  const draftProducts = products.filter(p => p.status === 'draft');

  const renderProducts = (items: Product[], emptyMessage: string) => {
    if (isLoading) {
      return (
        <div className="glass-card p-8 text-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="glass-card p-8 text-center">
          <p className="text-muted-foreground">{emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {items.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onPostNow={handlePostNow}
            onDelete={handleDelete}
          />
        ))}
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            <span className="gradient-text">Product Queue</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and organize your products for posting
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="queued" className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="queued" className="gap-2">
              <List className="h-4 w-4" />
              Queued ({queuedProducts.length})
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="gap-2">
              <Clock className="h-4 w-4" />
              Scheduled ({scheduledProducts.length})
            </TabsTrigger>
            <TabsTrigger value="drafts" className="gap-2">
              <Send className="h-4 w-4" />
              Drafts ({draftProducts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queued">
            {renderProducts(queuedProducts, "No products in queue. Add products to get started!")}
          </TabsContent>

          <TabsContent value="scheduled">
            {renderProducts(scheduledProducts, "No scheduled products.")}
          </TabsContent>

          <TabsContent value="drafts">
            {renderProducts(draftProducts, "No draft products.")}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default Queue;
