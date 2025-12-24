import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { QueueCard } from "@/components/products/QueueCard";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types/product";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { List, Clock, FileText } from "lucide-react";

const Queue = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .in("status", ["queued", "scheduled", "draft"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProducts(data as Product[]);
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductSent = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const handleProductDeleted = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const queuedProducts = products.filter((p) => p.status === "queued");
  const scheduledProducts = products.filter((p) => p.status === "scheduled");
  const draftProducts = products.filter((p) => p.status === "draft");

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
          <QueueCard
            key={product.id}
            product={product}
            onSent={handleProductSent}
            onDeleted={handleProductDeleted}
          />
        ))}
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            <span className="gradient-text">Product Queue</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage and send your products
          </p>
        </div>

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
              <FileText className="h-4 w-4" />
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
