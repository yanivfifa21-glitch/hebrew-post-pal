import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Store, Search, Loader2, ShoppingBag, Star, Package,
  CheckCircle2, ChevronDown, ExternalLink, AlertCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ZoneSelector } from "@/components/products/ZoneSelector";

type StoreProduct = {
  product_id: string;
  title: string;
  price: number;
  original_price: number;
  image_url: string;
  sales_count: number;
  rating: number;
  product_url: string;
  commission_rate?: number;
};

const StoreScanner = () => {
  const [storeUrl, setStoreUrl] = useState("");
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isAddingToQueue, setIsAddingToQueue] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalProducts, setTotalProducts] = useState(0);
  const [sellerId, setSellerId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [addProgress, setAddProgress] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id || null);
    });
  }, []);

  const handleScan = async (page = 1, append = false) => {
    if (!storeUrl.trim()) {
      toast({ title: "הזן קישור חנות", variant: "destructive" });
      return;
    }

    if (append) setIsLoadingMore(true);
    else setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("scan-store", {
        body: { storeUrl: storeUrl.trim(), pageNo: page },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Failed to scan store");

      if (append) {
        setProducts(prev => {
          const existingIds = new Set(prev.map(p => p.product_id));
          const uniqueNew = data.products.filter((p: StoreProduct) => !existingIds.has(p.product_id));
          return [...prev, ...uniqueNew];
        });
      } else {
        setProducts(data.products);
        setSelectedIds(new Set());
      }

      setHasFetched(true);
      setCurrentPage(page);
      setHasMore(data.hasMore);
      setTotalProducts(data.total);
      setSellerId(data.sellerId);

      if (!append) {
        toast({
          title: `🏪 נמצאו ${data.total} מוצרים`,
          description: `חנות #${data.sellerId} - מציג ${data.products.length} מוצרים`,
        });
      }
    } catch (e) {
      toast({
        title: "שגיאה בסריקה",
        description: e instanceof Error ? e.message : "לא הצלחנו לסרוק את החנות",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (!isLoadingMore && hasMore) {
      handleScan(currentPage + 1, true);
    }
  };

  const toggleSelection = (productId: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) newSet.delete(productId);
      else newSet.add(productId);
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === products.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(products.map(p => p.product_id)));
  };

  const handleAddToQueue = async () => {
    if (!userId || selectedIds.size === 0) return;
    setIsAddingToQueue(true);
    setAddProgress(0);

    const selectedProducts = products.filter(p => selectedIds.has(p.product_id));
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < selectedProducts.length; i++) {
      const product = selectedProducts[i];
      setAddProgress(Math.round(((i + 1) / selectedProducts.length) * 100));

      try {
        // Generate affiliate link
        const { data: affResp, error: affErr } = await supabase.functions.invoke("generate-affiliate-link", {
          body: { productUrl: product.product_url, userId },
        });
        if (affErr) throw new Error(affErr.message);
        const affiliateLink = affResp?.success ? affResp.affiliateLink : product.product_url;

        // Generate Hebrew description
        const { data: hebResp, error: hebErr } = await supabase.functions.invoke("generate-hebrew-post", {
          body: { title: product.title, ordersCount: product.sales_count || 0, rating: product.rating || 0, userId },
        });
        if (hebErr) throw new Error(hebErr.message);
        if (!hebResp?.success) throw new Error(hebResp?.error || "Failed to generate Hebrew content");

        const ctaOptions = ["לרכישה", "להזמנה", "להזמנה מאליאקספרס"];
        const randomCta = ctaOptions[Math.floor(Math.random() * ctaOptions.length)];
        const hebrewDescription = `${hebResp.hebrewDescription}\n\n👇 ${randomCta}:\n${affiliateLink}`;

        let normalizedRating = product.rating ?? 0;
        if (normalizedRating > 5) normalizedRating = normalizedRating / 20;
        normalizedRating = Math.min(normalizedRating, 5);

        const { data: savedProduct, error: saveErr } = await supabase.from("products").insert({
          original_url: product.product_url,
          title: product.title,
          price: product.price,
          image_url: product.image_url,
          orders_count: product.sales_count || 0,
          rating: normalizedRating,
          affiliate_link: affiliateLink,
          hebrew_description: hebrewDescription,
          status: "Scheduled",
          channels: [],
          user_id: userId,
        }).select("id").single();

        if (saveErr) throw new Error(saveErr.message);

        if (selectedZones.length > 0 && savedProduct) {
          const zoneInserts = selectedZones.map(zoneId => ({
            zone_id: zoneId, product_id: savedProduct.id, status: "Scheduled",
          }));
          await supabase.from("zone_products").insert(zoneInserts);
        }
        successCount++;
      } catch (e) {
        console.error(`Failed to add product ${product.title}:`, e);
        failCount++;
      }
    }

    setSelectedIds(new Set());
    setIsAddingToQueue(false);
    setAddProgress(0);
    toast({
      title: `✨ נוספו ${successCount} מוצרים לתור!`,
      description: failCount > 0 ? `${failCount} נכשלו` : "כל המוצרים נוספו בהצלחה עם ניסוח AI וקישור שותף",
    });
  };

  const discountPercent = (p: StoreProduct) => {
    if (p.original_price > p.price && p.price > 0) {
      return Math.round((1 - p.price / p.original_price) * 100);
    }
    return 0;
  };

  return (
    <MainLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Store className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-hebrew">סריקת חנות</h1>
            <p className="text-sm text-muted-foreground font-hebrew">הזן קישור חנות באליאקספרס וטען את כל המוצרים שלה</p>
          </div>
        </div>

        {/* Search bar */}
        <div className="flex gap-2">
          <Input
            placeholder="https://www.aliexpress.com/store/1234567"
            value={storeUrl}
            onChange={e => setStoreUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleScan(1, false)}
            className="flex-1 text-left"
            dir="ltr"
          />
          <Button
            onClick={() => handleScan(1, false)}
            disabled={isLoading || !storeUrl.trim()}
            className="gap-2 min-w-[120px]"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="font-hebrew">סרוק</span>
          </Button>
        </div>

        {/* Zone selector + actions */}
        {hasFetched && products.length > 0 && (
          <div className="space-y-4">
            <ZoneSelector
              selectedZones={selectedZones}
              onSelectionChange={setSelectedZones}
            />

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedIds.size === products.length && products.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-sm font-hebrew text-muted-foreground">
                    {selectedIds.size > 0 ? `נבחרו ${selectedIds.size} מתוך ${products.length}` : "בחר הכל"}
                  </span>
                </div>
                {sellerId && (
                  <Badge variant="outline" className="gap-1">
                    <Store className="h-3 w-3" />
                    חנות #{sellerId}
                  </Badge>
                )}
                <Badge variant="secondary" className="gap-1">
                  <Package className="h-3 w-3" />
                  {totalProducts} מוצרים
                </Badge>
              </div>

              {selectedIds.size > 0 && (
                <Button
                  onClick={handleAddToQueue}
                  disabled={isAddingToQueue}
                  className="gap-2"
                >
                  {isAddingToQueue ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ShoppingBag className="h-4 w-4" />
                  )}
                  <span className="font-hebrew">
                    הוסף {selectedIds.size} לתור
                  </span>
                </Button>
              )}
            </div>

            {isAddingToQueue && (
              <div className="space-y-2">
                <Progress value={addProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center font-hebrew">
                  מייצר ניסוח AI וקישורי שותף... {addProgress}%
                </p>
              </div>
            )}
          </div>
        )}

        {/* Products grid */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-muted-foreground font-hebrew">סורק את החנות...</p>
          </div>
        )}

        {!isLoading && hasFetched && products.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground font-hebrew">לא נמצאו מוצרים בחנות זו</p>
            <p className="text-xs text-muted-foreground font-hebrew">נסה קישור חנות אחר</p>
          </div>
        )}

        {!isLoading && products.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {products.map(product => {
                const isSelected = selectedIds.has(product.product_id);
                const discount = discountPercent(product);

                return (
                  <div
                    key={product.product_id}
                    onClick={() => toggleSelection(product.product_id)}
                    className={cn(
                      "group relative rounded-xl border bg-card overflow-hidden cursor-pointer transition-all duration-200",
                      isSelected
                        ? "border-primary ring-2 ring-primary/20 shadow-md"
                        : "border-border/50 hover:border-border hover:shadow-sm"
                    )}
                  >
                    {/* Selection indicator */}
                    <div className={cn(
                      "absolute top-2 right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center transition-all",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-background/80 border border-border"
                    )}>
                      {isSelected && <CheckCircle2 className="h-4 w-4" />}
                    </div>

                    {/* Discount badge */}
                    {discount > 0 && (
                      <Badge className="absolute top-2 left-2 z-10 bg-destructive text-destructive-foreground text-[10px] px-1.5">
                        -{discount}%
                      </Badge>
                    )}

                    {/* Image */}
                    <div className="aspect-square bg-muted/30 overflow-hidden">
                      <img
                        src={product.image_url}
                        alt={product.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    </div>

                    {/* Info */}
                    <div className="p-2.5 space-y-1.5">
                      <p className="text-xs line-clamp-2 leading-tight text-foreground" dir="ltr">
                        {product.title}
                      </p>

                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-bold text-primary">
                          ₪{product.price.toFixed(0)}
                        </span>
                        {product.original_price > product.price && (
                          <span className="text-[10px] text-muted-foreground line-through">
                            ₪{product.original_price.toFixed(0)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {product.sales_count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Package className="h-3 w-3" />
                            {product.sales_count.toLocaleString()}
                          </span>
                        )}
                        {product.rating > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {product.rating.toFixed(1)}
                          </span>
                        )}
                        {(product.commission_rate || 0) > 0 && (
                          <span className="text-primary font-medium">
                            {product.commission_rate}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* External link */}
                    <a
                      href={product.product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="absolute bottom-2 left-2 p-1 rounded-md bg-muted/80 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </a>
                  </div>
                );
              })}
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="gap-2"
                >
                  {isLoadingMore ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  <span className="font-hebrew">טען עוד מוצרים</span>
                </Button>
              </div>
            )}
          </>
        )}

        {/* Empty state */}
        {!isLoading && !hasFetched && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="p-4 rounded-2xl bg-muted/50">
              <Store className="h-12 w-12 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold font-hebrew text-lg">סרוק חנות באליאקספרס</h3>
              <p className="text-sm text-muted-foreground font-hebrew mt-1">
                הדבק קישור של חנות וטען את כל המוצרים עם קישורי שותף וניסוח AI
              </p>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default StoreScanner;
