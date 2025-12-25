import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { QueueCard } from "@/components/products/QueueCard";
import { EmptyQueue } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types/product";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { List, Clock, FileText, Sparkles } from "lucide-react";

const Queue = () => {
  const navigate = useNavigate();
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

  const handleStatusChanged = (productId: string, newStatus: string) => {
    setProducts((prev) => 
      prev.map((p) => p.id === productId ? { ...p, status: newStatus as Product['status'] } : p)
    );
  };

  const queuedProducts = products.filter((p) => p.status === "queued");
  const scheduledProducts = products.filter((p) => p.status === "scheduled");
  const draftProducts = products.filter((p) => p.status === "draft");

  const renderProducts = (items: Product[], emptyMessage: string, emptyDescription: string) => {
    if (isLoading) {
      return <SkeletonList count={3} />;
    }

    if (items.length === 0) {
      return (
        <EmptyQueue onAdd={() => navigate("/add-product")} />
      );
    }

    return (
      <div className="space-y-4">
        {items.map((product, index) => (
          <div 
            key={product.id} 
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <QueueCard
              product={product}
              onSent={handleProductSent}
              onDeleted={handleProductDeleted}
              onStatusChanged={handleStatusChanged}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center shadow-glow-sm">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-3xl font-bold">
                <span className="gradient-text">Product Queue</span>
              </h1>
            </div>
            <p className="text-muted-foreground">
              Manage and send your products to connected channels
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="queued" className="space-y-6">
          <TabsList className="bg-muted/30 p-1.5 rounded-xl border border-border/50 backdrop-blur-sm">
            <TabsTrigger 
              value="queued" 
              className="gap-2 rounded-lg data-[state=active]:bg-secondary/20 data-[state=active]:text-secondary data-[state=active]:shadow-sm"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Queued</span>
              <span className="bg-secondary/20 text-secondary text-xs font-bold px-2 py-0.5 rounded-full">
                {queuedProducts.length}
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="scheduled" 
              className="gap-2 rounded-lg data-[state=active]:bg-primary/20 data-[state=active]:text-primary data-[state=active]:shadow-sm"
            >
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Scheduled</span>
              <span className="bg-primary/20 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                {scheduledProducts.length}
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="drafts" 
              className="gap-2 rounded-lg data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Drafts</span>
              <span className="bg-muted text-muted-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                {draftProducts.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queued" className="animate-fade-in">
            {renderProducts(queuedProducts, "No products in queue", "Add products to get started!")}
          </TabsContent>

          <TabsContent value="scheduled" className="animate-fade-in">
            {renderProducts(scheduledProducts, "No scheduled products", "Schedule products for automatic posting.")}
          </TabsContent>

          <TabsContent value="drafts" className="animate-fade-in">
            {renderProducts(draftProducts, "No draft products", "Drafts are products you haven't finished editing.")}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default Queue;
