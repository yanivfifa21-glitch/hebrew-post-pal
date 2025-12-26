import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { ProductCard } from "@/components/products/ProductCard";
import { Package, Clock, Send, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types/product";
import { toast } from "@/hooks/use-toast";

const Dashboard = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<{ telegram_enabled: boolean; whatsapp_enabled: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const [productsRes, settingsRes] = await Promise.all([
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        user ? supabase.from('app_settings').select('*').eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null, error: null })
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const channels: string[] = [];
      
      if (settings?.whatsapp_enabled) {
        const { data, error } = await supabase.functions.invoke("send-whatsapp", {
          body: {
            title: product.title,
            hebrewDescription: product.hebrew_description,
            price: product.price,
            imageUrl: product.image_url,
            affiliateLink: product.affiliate_link,
            userId: user.id,
          },
        });
        if (error) throw new Error(`WhatsApp: ${error.message}`);
        if (!data?.success) throw new Error(`WhatsApp: ${data?.error || "Failed"}`);
        channels.push('whatsapp');
      }
      
      if (settings?.telegram_enabled) {
        const { data, error } = await supabase.functions.invoke("send-telegram", {
          body: {
            title: product.title,
            hebrewDescription: product.hebrew_description,
            price: product.price,
            imageUrl: product.image_url,
            affiliateLink: product.affiliate_link,
            userId: user.id,
          },
        });
        if (error) throw new Error(`Telegram: ${error.message}`);
        if (!data?.success) throw new Error(`Telegram: ${data?.error || "Failed"}`);
        channels.push('telegram');
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
        description: error instanceof Error ? error.message : "An error occurred while posting.",
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

  const stats = {
    total: products.length,
    queued: products.filter(p => p.status === 'queued').length,
    sent: products.filter(p => p.status === 'sent').length,
    scheduled: products.filter(p => p.status === 'scheduled').length,
  };

  const recentProducts = products.slice(0, 5);

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            <span className="gradient-text">Dashboard</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Overview of your affiliate automation
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="Total Products"
            value={stats.total}
            icon={Package}
            trend={{ value: 12, isPositive: true }}
          />
          <StatsCard
            title="In Queue"
            value={stats.queued}
            icon={Clock}
          />
          <StatsCard
            title="Sent Today"
            value={stats.sent}
            icon={Send}
            trend={{ value: 8, isPositive: true }}
          />
          <StatsCard
            title="Scheduled"
            value={stats.scheduled}
            icon={TrendingUp}
          />
        </div>

        {/* Recent Products */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-foreground">Recent Products</h2>
          </div>
          
          {isLoading ? (
            <div className="glass-card p-8 text-center">
              <div className="animate-pulse text-muted-foreground">Loading...</div>
            </div>
          ) : recentProducts.length > 0 ? (
            <div className="space-y-4">
              {recentProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onPostNow={handlePostNow}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ) : (
            <div className="glass-card p-8 text-center">
              <p className="text-muted-foreground">No products yet. Add your first product!</p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default Dashboard;
