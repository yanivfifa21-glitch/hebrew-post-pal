import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { ProductEditor, Coupon } from "@/components/products/ProductEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, Link as LinkIcon, AlertTriangle } from "lucide-react";
import { FetchedProductData, Product } from "@/types/product";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function formatAliError(payload: any): string {
  const msg = String(payload?.error || payload?.msg || "Unknown error");
  const parts = [msg];
  if (payload?.code) parts.push(`code: ${payload.code}`);
  if (payload?.request_id) parts.push(`request_id: ${payload.request_id}`);
  if (payload?.trace_id) parts.push(`trace_id: ${payload.trace_id}`);
  return parts.join(" | ");
}

const AddProduct = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [url, setUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [fetchedProduct, setFetchedProduct] = useState<FetchedProductData | null>(null);
  const [draftProductId, setDraftProductId] = useState<string | null>(null);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Omit<Product, "id" | "created_at" | "updated_at"> | null>(null);
  const [pendingAction, setPendingAction] = useState<"queue" | "post" | null>(null);
  const [initialCoupons, setInitialCoupons] = useState<Coupon[] | undefined>(undefined);

  // Handle pre-filled data from Excel import
  useEffect(() => {
    const urlParam = searchParams.get("url");
    const title = searchParams.get("title");
    const price = searchParams.get("price");
    const originalPrice = searchParams.get("originalPrice");
    const imageUrl = searchParams.get("imageUrl");
    const couponCode = searchParams.get("couponCode");
    const couponValue = searchParams.get("couponValue");

    if (urlParam) {
      setUrl(urlParam);
      
      // If we have all the data from Excel, pre-populate the product
      if (title && price) {
        setFetchedProduct({
          title: title,
          price: parseFloat(price),
          image_url: imageUrl || "",
          orders_count: 0,
          rating: 0,
          affiliateLink: urlParam,
          hebrewDescription: "",
        });

        // Set initial coupons if provided
        if (couponCode) {
          setInitialCoupons([{ code: couponCode, amount: couponValue || "" }]);
        }

        toast({
          title: "Product Loaded",
          description: "Edit the details and generate Hebrew content",
        });
      }
    }
  }, [searchParams]);

  const handleFetch = async () => {
    const inputUrl = url.trim();

    if (!inputUrl) {
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
        body: { productUrl: inputUrl },
      });

      if (metaErr) {
        throw new Error("Could not connect to AliExpress API. Please try again.");
      }
      if (!metaResp?.success) {
        const errMsg = metaResp?.error || metaResp?.msg || "";
        if (errMsg.toLowerCase().includes("invalid") || errMsg.toLowerCase().includes("not found")) {
          throw new Error("Invalid AliExpress link. Please check the URL and try again.");
        }
        if (errMsg.toLowerCase().includes("timeout")) {
          throw new Error("AliExpress API timeout. Please try again in a moment.");
        }
        throw new Error(formatAliError(metaResp));
      }

      const meta = metaResp.data as {
        title: string;
        price: number;
        image_url: string;
        orders_count: number;
        rating: number;
      };
      const cleanUrl = metaResp.cleanUrl as string;

      // Get current user for RLS
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // 2) Generate affiliate link
      setFetchStatus("Generating affiliate link...");

      const { data: affResp, error: affErr } = await supabase.functions.invoke("generate-affiliate-link", {
        body: { productUrl: cleanUrl || inputUrl, userId: user.id },
      });

      if (affErr) throw new Error(affErr.message);

      const affiliateLink = affResp?.success ? (affResp.affiliateLink as string) : (cleanUrl || inputUrl);
      if (!affResp?.success) {
        toast({
          title: "Affiliate API Error",
          description: formatAliError(affResp),
          variant: "destructive",
        });
      }

      // 3) Generate Hebrew post (AI) - pass social proof data and userId
      setFetchStatus("Writing Hebrew description...");

      const { data: hebResp, error: hebErr } = await supabase.functions.invoke("generate-hebrew-post", {
        body: { 
          title: meta.title, 
          ordersCount: meta.orders_count,
          rating: meta.rating,
          userId: user.id,
        },
      });

      if (hebErr) {
        throw new Error("AI service connection failed. Please try again.");
      }
      if (!hebResp?.success) {
        const errMsg = hebResp?.error || "";
        if (errMsg.toLowerCase().includes("timeout") || errMsg.toLowerCase().includes("rate")) {
          throw new Error("AI service is busy. Please wait a moment and try again.");
        }
        throw new Error(hebResp?.error || "Failed to generate Hebrew content");
      }

      // AI generates description only, app appends the link with random CTA
      const aiDescription = hebResp.hebrewDescription as string;
      const { formatProductLink } = await import("@/lib/ctaUtils");
      const hebrewDescription = `${aiDescription}\n\n${formatProductLink(affiliateLink)}`;

      // Save as draft immediately
      setFetchStatus("Saving draft...");

      // Normalize rating to 0-5 scale if needed (API might return 0-100)
      let normalizedRating = meta.rating ?? 0;
      if (normalizedRating > 5) {
        normalizedRating = normalizedRating / 20;
      }

      const { data: draftRow, error: draftErr } = await supabase
        .from("products")
        .insert({
          original_url: cleanUrl || inputUrl,
          title: meta.title,
          price: meta.price ?? 0,
          image_url: meta.image_url || null,
          orders_count: meta.orders_count ?? 0,
          rating: Math.min(normalizedRating, 5),
          affiliate_link: affiliateLink || null,
          hebrew_description: hebrewDescription || null,
          status: "Scheduled",
          channels: [],
          user_id: user.id,
        })
        .select("id")
        .single();

      if (draftErr) {
        console.error("Draft save error:", draftErr);
        throw new Error(`Database error: ${draftErr.message}`);
      }
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
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({
        title: "Analyze Failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setIsFetching(false);
      setFetchStatus("");
    }
  };

  // Check for duplicate products – only block if same affiliate_link + same user + still pending
  const checkDuplicate = async (affiliateLink: string | null): Promise<boolean> => {
    if (!affiliateLink) return false;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("products")
      .select("id")
      .eq("affiliate_link", affiliateLink)
      .eq("user_id", user.id)
      .eq("status", "Scheduled")
      .neq("id", draftProductId || "")
      .limit(1);
    return (data?.length ?? 0) > 0;
  };

  const handleSaveToQueue = async (product: Omit<Product, "id" | "created_at" | "updated_at">) => {
    // FINAL OVERRIDE: disable duplicate restriction completely (per request)
    const isDuplicate = false;

    if (isDuplicate && !showDuplicateConfirm) {
      setPendingProduct(product);
      setPendingAction("queue");
      setShowDuplicateConfirm(true);
      return;
    }

    setShowDuplicateConfirm(false);
    setPendingProduct(null);
    setPendingAction(null);
    
    setIsSaving(true);
    try {
      if (draftProductId) {
        const { error } = await supabase
          .from("products")
          .update({ ...product, status: "Scheduled" })
          .eq("id", draftProductId);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { error } = await supabase.from("products").insert({ ...product, status: "Scheduled", user_id: user.id });
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

  const confirmDuplicateAction = () => {
    if (pendingProduct && pendingAction === "queue") {
      setShowDuplicateConfirm(false);
      handleSaveToQueue(pendingProduct);
    } else if (pendingProduct && pendingAction === "post") {
      setShowDuplicateConfirm(false);
      handlePostNow(pendingProduct);
    }
  };

  const cancelDuplicateAction = () => {
    setShowDuplicateConfirm(false);
    setPendingProduct(null);
    setPendingAction(null);
  };

  const handlePostNow = async (product: Omit<Product, "id" | "created_at" | "updated_at">) => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get active messaging accounts (not app_settings)
      const { data: accounts } = await supabase
        .rpc("get_my_messaging_accounts_safe");

      const activeWhatsApp = accounts?.filter(
        (acc: any) => acc.account_type === "whatsapp" && acc.is_active && acc.has_api_token && acc.has_instance_id
      ) || [];
      
      const activeTelegram = accounts?.filter(
        (acc: any) => acc.account_type === "telegram" && acc.is_active && acc.has_bot_token && acc.telegram_chat_id
      ) || [];

      const channels: string[] = [];
      const errors: string[] = [];

      // Send to all active WhatsApp accounts
      for (const acc of activeWhatsApp) {
        try {
          const { data, error } = await supabase.functions.invoke("send-whatsapp", {
            body: {
              title: product.title,
              hebrewDescription: product.hebrew_description,
              price: product.price,
              imageUrl: product.image_url,
              affiliateLink: product.affiliate_link,
              userId: user.id,
              accountId: acc.id,
            },
          });
          if (error) throw new Error(error.message);
          if (!data?.success) throw new Error(data?.error || "Failed");
          if (!channels.includes("whatsapp")) channels.push("whatsapp");
        } catch (e) {
          errors.push(`WhatsApp (${acc.account_name}): ${e instanceof Error ? e.message : "Failed"}`);
        }
      }

      // Send to all active Telegram accounts
      for (const acc of activeTelegram) {
        try {
          const { data, error } = await supabase.functions.invoke("send-telegram", {
            body: {
              title: product.title,
              hebrewDescription: product.hebrew_description,
              price: product.price,
              imageUrl: product.image_url,
              affiliateLink: product.affiliate_link,
              userId: user.id,
              accountId: acc.id,
            },
          });
          if (error) throw new Error(error.message);
          if (!data?.success) throw new Error(data?.error || "Failed");
          if (!channels.includes("telegram")) channels.push("telegram");
        } catch (e) {
          errors.push(`Telegram (${acc.account_name}): ${e instanceof Error ? e.message : "Failed"}`);
        }
      }

      if (channels.length === 0 && activeWhatsApp.length === 0 && activeTelegram.length === 0) {
        toast({
          title: "אין ערוצים פעילים",
          description: "הוסף חשבון WhatsApp או Telegram פעיל עם credentials בהגדרות.",
          variant: "destructive",
        });
        return;
      }

      if (channels.length === 0 && errors.length > 0) {
        throw new Error(errors.join("; "));
      }

      // Only update existing draft if it was already saved, don't create new record
      // User explicitly wants: after manual post, don't auto-save to queue
      if (draftProductId) {
        const { error } = await supabase
          .from("products")
          .update({ ...product, status: "Sent", channels })
          .eq("id", draftProductId);
        if (error) throw error;
      }
      // If no draftProductId, we simply don't save - the post was sent but not added to queue

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
            initialCoupons={initialCoupons}
          />
        )}

        {/* Duplicate Confirmation Dialog */}
        <AlertDialog open={showDuplicateConfirm} onOpenChange={setShowDuplicateConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Duplicate Product
              </AlertDialogTitle>
              <AlertDialogDescription>
                This product is already in your queue. Do you want to add it anyway?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={cancelDuplicateAction}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDuplicateAction}>
                Add Anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
};

export default AddProduct;
