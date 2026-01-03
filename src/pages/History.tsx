import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { ProductCard } from "@/components/products/ProductCard";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types/product";
import { toast } from "@/hooks/use-toast";
import { History as HistoryIcon, RotateCcw, Loader2 } from "lucide-react";

const History = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('status', 'Sent')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setProducts(data as Product[]);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (product: Product) => {
    try {
      await supabase.from('products').delete().eq('id', product.id);
      toast({ title: "Product deleted from history" });
      fetchData();
    } catch (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleSendToQueue = async (product: Product) => {
    setResendingId(product.id);
    try {
      const { error } = await supabase
        .from('products')
        .update({ status: 'Scheduled' })
        .eq('id', product.id);

      if (error) throw error;
      
      toast({ 
        title: "חזר לתור!",
        description: "המוצר הועבר בחזרה לתור השליחה"
      });
      fetchData();
    } catch (error) {
      console.error('Error moving to queue:', error);
      toast({ title: "Failed to move to queue", variant: "destructive" });
    } finally {
      setResendingId(null);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
            <HistoryIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              <span className="gradient-text">Post History</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              View all your previously sent products
            </p>
          </div>
        </div>

        {/* History List */}
        {isLoading ? (
          <div className="glass-card p-8 text-center">
            <div className="animate-pulse text-muted-foreground">Loading...</div>
          </div>
        ) : products.length > 0 ? (
          <div className="space-y-4">
            {products.map((product) => (
              <div key={product.id} className="relative">
                <ProductCard
                  product={product}
                  onDelete={handleDelete}
                />
                {/* Send to Queue Button */}
                <div className="absolute top-3 left-3 z-10">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSendToQueue(product)}
                    disabled={resendingId === product.id}
                    className="bg-background/80 backdrop-blur-sm border-primary/50 text-primary hover:bg-primary/10"
                  >
                    {resendingId === product.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <RotateCcw className="h-4 w-4 mr-1" />
                        החזר לתור
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card p-12 text-center">
            <HistoryIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No History Yet</h3>
            <p className="text-muted-foreground">
              Products you post will appear here.
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default History;
