import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { ProductEditor } from "@/components/products/ProductEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, Link as LinkIcon } from "lucide-react";
import { FetchedProductData, Product } from "@/types/product";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

const AddProduct = () => {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [fetchedProduct, setFetchedProduct] = useState<FetchedProductData | null>(null);
  const [draftProductId, setDraftProductId] = useState<string | null>(null);

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
    setFetchStatus("Fetching product metadata...");
    setFetchedProduct(null);
    setDraftProductId(null);

    try {
      // 1) Fetch metadata (via backend)
      const { data: metaResp, error: metaErr } = await supabase.functions.invoke("fetch-ali-product", {
        body: { productUrl: url },
      });

      if (metaErr) throw new Error(metaErr.message);
      if (!metaResp?.success) throw new Error(metaResp?.error || "Failed to fetch product metadata");

      const meta = metaResp.data as {
        title: string;
        price: number;
        image_url: string;
        orders_count: number;
        rating: number;
      };
      const cleanUrl = metaResp.cleanUrl as string;

      // 2) Generate affiliate link
      setFetchStatus("Generating affiliate link...");
      const { data: affResp, error: affErr } = await supabase.functions.invoke("generate-affiliate-link", {
        body: { productUrl: cleanUrl || url },
      });

      if (affErr) throw new Error(affErr.message);

      const affiliateLink = affResp?.success ? (affResp.affiliateLink as string) : (cleanUrl || url);
      if (!affResp?.success) {
        toast({
          title: "Affiliate API Error",
          description: `${affResp?.error || "Unknown error"}${affResp?.code ? ` (${affResp.code})` : ""}`,
          variant: "destructive",
        });
      }

      // 3) Generate Hebrew post (AI)
      setFetchStatus("Writing Hebrew description...");
      const { data: hebResp, error: hebErr } = await supabase.functions.invoke("generate-hebrew-post", {
        body: { title: meta.title, priceUsd: meta.price },
      });

      if (hebErr) throw new Error(hebErr.message);
      if (!hebResp?.success) throw new Error(hebResp?.error || "Failed to generate Hebrew content");

      const hebrewDescription = hebResp.hebrewDescription as string;

      // Save as draft immediately (so it shows up and can be updated later)
      setFetchStatus("Saving draft...");
      const { data: draftRow, error: draftErr } = await supabase
        .from("products")
        .insert({
          original_url: cleanUrl || url,
          title: meta.title,
          price: meta.price,
          image_url: meta.image_url || null,
          orders_count: meta.orders_count ?? 0,
          rating: meta.rating ?? 0,
          affiliate_link: affiliateLink || null,
          hebrew_description: hebrewDescription || null,
          status: "draft",
          channels: [],
        })
        .select("id")
        .single();

      if (draftErr) throw draftErr;
      setDraftProductId(draftRow.id);

      setFetchedProduct({
        title: meta.title,
        price: meta.price,
        image_url: meta.image_url,
        orders_count: meta.orders_count,
        rating: meta.rating,
        affiliateLink,
        hebrewDescription,
      });

      toast({
        title: "Product Ready!",
        description: "Metadata, affiliate link and Hebrew post are ready.",
      });
    } catch (e: unknown) {
      toast({
        title: "Analyze Failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsFetching(false);
      setFetchStatus("");
    }
  };

  const handleSaveToQueue = async (product: Omit<Product, "id" | "created_at" | "updated_at">) => {
    setIsSaving(true);
    try {
      if (draftProductId) {
        const { error } = await supabase
          .from("products")
          .update({ ...product, status: "queued" })
          .eq("id", draftProductId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert({ ...product, status: "queued" });
        if (error) throw error;
      }

      toast({
        title: "Saved to Queue!",
        description: "Product has been added to your queue.",
      });

      navigate("/queue");
    } catch {
      toast({
        title: "Save Failed",
        description: "Could not save product to queue.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePostNow = async (product: Omit<Product, "id" | "created_at" | "updated_at">) => {
    setIsSaving(true);
    try {
      const { data: settings, error: settingsErr } = await supabase
        .from("app_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (settingsErr) throw settingsErr;

      const channels: string[] = [];

      if (settings?.whatsapp_enabled) {
        const { data, error } = await supabase.functions.invoke("send-whatsapp", {
          body: {
            title: product.title,
            hebrewDescription: product.hebrew_description,
            price: product.price,
            imageUrl: product.image_url,
            affiliateLink: product.affiliate_link,
          },
        });

        if (error) throw new Error(`WhatsApp: ${error.message}`);
        if (!data?.success) throw new Error(`WhatsApp: ${data?.error || "Failed to send"}`);

        channels.push("whatsapp");
      }

      if (channels.length === 0) {
        toast({
          title: "No Channels Enabled",
          description: "Please enable WhatsApp in Settings first.",
          variant: "destructive",
        });
        return;
      }

      if (draftProductId) {
        const { error } = await supabase
          .from("products")
          .update({ ...product, status: "sent", channels })
          .eq("id", draftProductId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert({ ...product, status: "sent", channels });
        if (error) throw error;
      }

      toast({
        title: "Posted Successfully!",
        description: `Sent to ${channels.join(" & ")}`,
      });

      navigate("/");
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
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            <span className="gradient-text">Add Product</span>
          </h1>
          <p className="text-muted-foreground mt-1">Import products from AliExpress and generate marketing content</p>
        </div>

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
              <Label htmlFor="url" className="sr-only">
                AliExpress URL
              </Label>
              <Input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://aliexpress.com/item/..."
                className="h-12"
              />
            </div>
            <Button onClick={handleFetch} disabled={isFetching} size="lg" variant="gradient">
              {isFetching ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  {fetchStatus || "Processing..."}
                </>
              ) : (
                <>
                  <Search className="h-5 w-5 mr-2" />
                  Analyze Product
                </>
              )}
            </Button>
          </div>
        </div>

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
