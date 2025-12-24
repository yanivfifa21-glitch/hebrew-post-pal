import { useState, useEffect } from "react";
import { FetchedProductData, Product } from "@/types/product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, Save, Send, Loader2 } from "lucide-react";
import { generateHebrewContent } from "@/lib/mockApi";
import { toast } from "@/hooks/use-toast";

interface ProductEditorProps {
  productData: FetchedProductData;
  originalUrl: string;
  onSaveToQueue: (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => void;
  onPostNow: (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => void;
  isLoading?: boolean;
}

export const ProductEditor = ({ 
  productData, 
  originalUrl, 
  onSaveToQueue, 
  onPostNow,
  isLoading 
}: ProductEditorProps) => {
  const [title, setTitle] = useState(productData.title);
  const [hebrewDescription, setHebrewDescription] = useState("");
  const [price, setPrice] = useState(productData.price.toString());
  const [affiliateLink, setAffiliateLink] = useState(productData.affiliateLink || "");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    // Auto-generate Hebrew content on load
    handleGenerateHebrew();
  }, []);

  const handleGenerateHebrew = async () => {
    setIsGenerating(true);
    try {
      const content = await generateHebrewContent(title, parseFloat(price));
      setHebrewDescription(content);
      toast({
        title: "Content Generated!",
        description: "AI has created your Hebrew marketing post.",
      });
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Could not generate content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const createProduct = (): Omit<Product, 'id' | 'created_at' | 'updated_at'> => ({
    original_url: originalUrl,
    affiliate_link: affiliateLink || null,
    image_url: productData.image_url,
    title,
    hebrew_description: hebrewDescription,
    price: parseFloat(price),
    orders_count: productData.orders_count,
    rating: productData.rating,
    status: 'draft',
    scheduled_time: null,
    channels: [],
  });

  return (
    <div className="glass-card neon-border p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Product Editor</h2>
          <p className="text-sm text-muted-foreground">Customize and generate marketing content</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Image Preview */}
        <div className="space-y-4">
          <div className="relative aspect-square rounded-xl overflow-hidden border border-border">
            <img 
              src={productData.image_url} 
              alt={title}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/90 to-transparent p-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-primary font-mono font-bold">${price}</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">⭐ {productData.rating}</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-muted-foreground">{productData.orders_count.toLocaleString()} orders</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="title">Product Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="price">Price ($)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="affiliate">Affiliate Link</Label>
                <Input
                  id="affiliate"
                  value={affiliateLink}
                  onChange={(e) => setAffiliateLink(e.target.value)}
                  placeholder="Your affiliate link..."
                  className="mt-1.5"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Hebrew Content */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="hebrew">Generated Hebrew Post</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateHebrew}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              Regenerate
            </Button>
          </div>
          <Textarea
            id="hebrew"
            value={hebrewDescription}
            onChange={(e) => setHebrewDescription(e.target.value)}
            className="min-h-[280px] text-right font-medium"
            dir="rtl"
            placeholder="AI will generate Hebrew marketing content..."
          />

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => onSaveToQueue(createProduct())}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save to Queue
            </Button>
            <Button
              variant="gradient"
              className="flex-1"
              onClick={() => onPostNow(createProduct())}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Post Now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
