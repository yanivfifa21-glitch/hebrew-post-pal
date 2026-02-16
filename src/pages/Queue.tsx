import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { QueueCard } from "@/components/products/QueueCard";
import { EmptyQueue } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types/product";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock, CheckCircle, Sparkles, Wand2, Loader2, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const Queue = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceProgress, setEnhanceProgress] = useState(0);
  const [enhanceTotal, setEnhanceTotal] = useState(0);
  const [currentEnhancing, setCurrentEnhancing] = useState("");

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .in("status", ["Scheduled", "Sent"])
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
    setProducts((prev) => 
      prev.map((p) => p.id === productId ? { ...p, status: 'Sent' as Product['status'] } : p)
    );
  };

  const handleProductDeleted = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
    setSelectedProducts((prev) => {
      const newSet = new Set(prev);
      newSet.delete(productId);
      return newSet;
    });
  };

  const handleStatusChanged = (productId: string, newStatus: string) => {
    setProducts((prev) => 
      prev.map((p) => p.id === productId ? { ...p, status: newStatus as Product['status'] } : p)
    );
  };

  const handleSelectionChange = (productId: string, selected: boolean) => {
    setSelectedProducts((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(productId);
      } else {
        newSet.delete(productId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allScheduledIds = scheduledProducts.map(p => p.id);
      setSelectedProducts(new Set(allScheduledIds));
    } else {
      setSelectedProducts(new Set());
    }
  };

  const handleEnhanceSelected = async () => {
    if (selectedProducts.size === 0) {
      toast({
        title: "No products selected",
        description: "Please select at least one product to enhance.",
        variant: "destructive",
      });
      return;
    }

    const productsToEnhance = products.filter(
      p => selectedProducts.has(p.id) && p.image_url
    );

    if (productsToEnhance.length === 0) {
      toast({
        title: "No valid images",
        description: "Selected products don't have images to enhance.",
        variant: "destructive",
      });
      return;
    }

    setIsEnhancing(true);
    setEnhanceProgress(0);
    setEnhanceTotal(productsToEnhance.length);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Not authenticated", variant: "destructive" });
      setIsEnhancing(false);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < productsToEnhance.length; i++) {
      const product = productsToEnhance[i];
      setCurrentEnhancing(product.title?.substring(0, 30) || "Product");
      setEnhanceProgress(i);

      try {
        const { data, error } = await supabase.functions.invoke("enhance-product-image", {
          body: {
            productId: product.id,
            imageUrl: product.image_url,
            userId: user.id,
          },
        });

        if (error) throw new Error(error.message);
        if (!data?.success) throw new Error(data?.error || "Enhancement failed");

        // Update the product in local state with new image
        if (data.imageUrl) {
          setProducts((prev) =>
            prev.map((p) =>
              p.id === product.id ? { ...p, image_url: data.imageUrl } : p
            )
          );
        }
        successCount++;
      } catch (error) {
        console.error(`Failed to enhance product ${product.id}:`, error);
        failCount++;
      }
    }

    setEnhanceProgress(productsToEnhance.length);
    setIsEnhancing(false);
    setSelectedProducts(new Set());
    setCurrentEnhancing("");

    toast({
      title: "✨ Enhancement Complete",
      description: `Successfully enhanced ${successCount} images${failCount > 0 ? `, ${failCount} failed` : ""}`,
    });
  };

  const scheduledProducts = products.filter((p) => p.status === "Scheduled");
  const sentAutoProducts = products.filter((p) => p.status === "Sent" && p.sent_via !== "manual");
  const sentManualProducts = products.filter((p) => p.status === "Sent" && p.sent_via === "manual");
  const sentProducts = products.filter((p) => p.status === "Sent");

  const renderProducts = (items: Product[], showSelection: boolean = false) => {
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
            className="relative"
          >
            <QueueCard
              product={product}
              onSent={handleProductSent}
              onDeleted={handleProductDeleted}
              onStatusChanged={handleStatusChanged}
              isSelected={selectedProducts.has(product.id)}
              onSelectionChange={handleSelectionChange}
              showCheckbox={showSelection}
            />
          </div>
        ))}
      </div>
    );
  };

  const allScheduledSelected = scheduledProducts.length > 0 && 
    scheduledProducts.every(p => selectedProducts.has(p.id));
  const someScheduledSelected = scheduledProducts.some(p => selectedProducts.has(p.id));

  return (
    <MainLayout>
      {/* Enhancement Progress Overlay */}
      {isEnhancing && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="glass-card p-8 max-w-md w-full mx-4 space-y-6">
            <div className="flex items-center justify-center gap-3">
              <Wand2 className="h-8 w-8 text-primary animate-pulse" />
              <h2 className="text-xl font-bold">Processing Images with AI...</h2>
            </div>
            <div className="space-y-2">
              <Progress value={(enhanceProgress / enhanceTotal) * 100} className="h-3" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Enhancing: {currentEnhancing}...</span>
                <span>{enhanceProgress} / {enhanceTotal}</span>
              </div>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Please wait while we transform your product images into professional marketing shots.
            </p>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
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
          
          {/* Enhance Button */}
          <Button
            variant="gradient"
            onClick={handleEnhanceSelected}
            disabled={selectedProducts.size === 0 || isEnhancing}
            className="gap-2"
          >
            {isEnhancing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            ✨ Enhance Selected ({selectedProducts.size})
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="scheduled" className="space-y-6">
          <TabsList className="bg-muted/30 p-1.5 rounded-xl border border-border/50 backdrop-blur-sm">
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
              value="sent-auto" 
              className="gap-2 rounded-lg data-[state=active]:bg-success/20 data-[state=active]:text-success data-[state=active]:shadow-sm"
            >
              <CheckCircle className="h-4 w-4" />
              <span className="hidden sm:inline">נשלחו (אוטו)</span>
              <span className="bg-success/20 text-success text-xs font-bold px-2 py-0.5 rounded-full">
                {sentAutoProducts.length}
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="sent-manual" 
              className="gap-2 rounded-lg data-[state=active]:bg-secondary/20 data-[state=active]:text-secondary data-[state=active]:shadow-sm"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">נשלחו (ידני)</span>
              <span className="bg-secondary/20 text-secondary text-xs font-bold px-2 py-0.5 rounded-full">
                {sentManualProducts.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scheduled" className="animate-fade-in space-y-4">
            {/* Select All Row */}
            {scheduledProducts.length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                <Checkbox
                  checked={allScheduledSelected}
                  onCheckedChange={(checked) => handleSelectAll(checked === true)}
                  className="h-5 w-5"
                  aria-label="Select all scheduled products"
                />
                <span className="text-sm font-medium">
                  {allScheduledSelected 
                    ? "Deselect All" 
                    : someScheduledSelected 
                      ? `${selectedProducts.size} selected` 
                      : "Select All"
                  }
                </span>
              </div>
            )}
            {renderProducts(scheduledProducts, true)}
          </TabsContent>

          <TabsContent value="sent-auto" className="animate-fade-in">
            {renderProducts(sentAutoProducts, false)}
          </TabsContent>

          <TabsContent value="sent-manual" className="animate-fade-in">
            {renderProducts(sentManualProducts, false)}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default Queue;
