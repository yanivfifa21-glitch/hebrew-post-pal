import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { ProductEditor } from "@/components/products/ProductEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, Link as LinkIcon } from "lucide-react";
import { fetchAliExpressProduct } from "@/lib/mockApi";
import { FetchedProductData, Product } from "@/types/product";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const AddProduct = () => {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fetchedProduct, setFetchedProduct] = useState<FetchedProductData | null>(null);

  const handleFetch = async () => {
    if (!url.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter an AliExpress product URL.",
        variant: "destructive",
      });
      return;
    }

    setIsFetching(true);
    try {
      // Fetch mock product data (later can be replaced with real scraping)
      const data = await fetchAliExpressProduct(url);
      
      // Generate affiliate link via AliExpress API
      let affiliateLink = url;
      try {
        const { data: linkData, error: linkError } = await supabase.functions.invoke('generate-affiliate-link', {
          body: { productUrl: url }
        });
        
        if (linkError) {
          console.warn('Affiliate link error:', linkError);
        } else if (linkData?.success && linkData?.affiliateLink) {
          affiliateLink = linkData.affiliateLink;
          toast({
            title: "Affiliate Link Generated!",
            description: "Your tracking link was created automatically.",
          });
        } else if (linkData?.error) {
          console.warn('Affiliate API error:', linkData.error);
          toast({
            title: "Affiliate Link Warning",
            description: "Using original URL - affiliate API returned an error.",
            variant: "destructive",
          });
        }
      } catch (affiliateError) {
        console.warn('Failed to generate affiliate link:', affiliateError);
      }
      
      setFetchedProduct({ ...data, affiliateLink });
      toast({
        title: "Product Fetched!",
        description: "Product data has been loaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Fetch Failed",
        description: error instanceof Error ? error.message : "Could not fetch product data.",
        variant: "destructive",
      });
    } finally {
      setIsFetching(false);
    }
  };

  const handleSaveToQueue = async (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
    setIsSaving(true);
    try {
      const { error } = await supabase.from('products').insert({
        ...product,
        status: 'queued',
      });

      if (error) throw error;

      toast({
        title: "Saved to Queue!",
        description: "Product has been added to your queue.",
      });
      
      navigate('/queue');
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Could not save product to queue.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePostNow = async (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
    setIsSaving(true);
    try {
      // Get settings
      const { data: settings } = await supabase
        .from('app_settings')
        .select('*')
        .limit(1)
        .single();

      const channels: string[] = [];

      if (settings?.whatsapp_enabled) {
        // Call WhatsApp edge function
        const { data, error } = await supabase.functions.invoke('send-whatsapp', {
          body: {
            title: product.title,
            hebrewDescription: product.hebrew_description,
            price: product.price,
            imageUrl: product.image_url,
            affiliateLink: product.affiliate_link,
          }
        });

        if (error) {
          throw new Error(`WhatsApp: ${error.message}`);
        }

        if (!data?.success) {
          throw new Error(`WhatsApp: ${data?.error || 'Failed to send'}`);
        }

        channels.push('whatsapp');
      }

      if (channels.length === 0) {
        toast({
          title: "No Channels Enabled",
          description: "Please enable WhatsApp in Settings first.",
          variant: "destructive",
        });
        setIsSaving(false);
        return;
      }

      const { error } = await supabase.from('products').insert({
        ...product,
        status: 'sent',
        channels,
      });

      if (error) throw error;

      toast({
        title: "Posted Successfully!",
        description: `Sent to ${channels.join(' & ')}`,
      });
      
      navigate('/');
    } catch (error) {
      toast({
        title: "Post Failed",
        description: error instanceof Error ? error.message : "Could not post product.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            <span className="gradient-text">Add Product</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Import products from AliExpress and generate marketing content
          </p>
        </div>

        {/* URL Input */}
        <div className="glass-card neon-border p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
              <LinkIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Product URL</h2>
              <p className="text-sm text-muted-foreground">Paste your AliExpress product link</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="url" className="sr-only">AliExpress URL</Label>
              <Input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://aliexpress.com/item/..."
                className="h-12"
              />
            </div>
            <Button 
              onClick={handleFetch} 
              disabled={isFetching}
              size="lg"
              variant="gradient"
            >
              {isFetching ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Search className="h-5 w-5 mr-2" />
                  Fetch Data
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Product Editor */}
        {fetchedProduct && (
          <ProductEditor
            productData={fetchedProduct}
            originalUrl={url}
            onSaveToQueue={handleSaveToQueue}
            onPostNow={handlePostNow}
            isLoading={isSaving}
          />
        )}
      </div>
    </MainLayout>
  );
};

export default AddProduct;
