import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { QueueCard } from "@/components/products/QueueCard";
import { EmptyQueue } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Product } from "@/types/product";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock, CheckCircle, Sparkles, Wand2, Loader2, Send, RotateCcw, Ticket, PackageSearch, Trash2, Filter } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { applyCouponToText, Coupon, detectCouponsInText } from "@/lib/couponUtils";


const Queue = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [selectedManualProducts, setSelectedManualProducts] = useState<Set<string>>(new Set());
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isReturningBulk, setIsReturningBulk] = useState(false);
  const [enhanceProgress, setEnhanceProgress] = useState(0);
  const [enhanceTotal, setEnhanceTotal] = useState(0);
  const [currentEnhancing, setCurrentEnhancing] = useState("");
  const [isUpdatingCoupons, setIsUpdatingCoupons] = useState(false);
  const [isCheckingAllStock, setIsCheckingAllStock] = useState(false);
  const [stockCheckProgress, setStockCheckProgress] = useState(0);
  const [stockCheckTotal, setStockCheckTotal] = useState(0);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [showOnlyCoupons, setShowOnlyCoupons] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .in("status", ["Scheduled", "Sent"])
        .order("created_at", { ascending: true });

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
      prev.map((p) => p.id === productId ? { ...p, status: 'Sent' as Product['status'], sent_via: p.sent_via || 'manual' } : p)
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

  const handleManualSelectionChange = (productId: string, selected: boolean) => {
    setSelectedManualProducts((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(productId);
      } else {
        newSet.delete(productId);
      }
      return newSet;
    });
  };

  const handleSelectAllManual = (checked: boolean) => {
    if (checked) {
      setSelectedManualProducts(new Set(sentManualProducts.map(p => p.id)));
    } else {
      setSelectedManualProducts(new Set());
    }
  };

  const handleReturnSelectedToQueue = async () => {
    if (selectedManualProducts.size === 0) {
      toast({ title: "לא נבחרו פריטים", variant: "destructive" });
      return;
    }
    setIsReturningBulk(true);
    try {
      const ids = Array.from(selectedManualProducts);
      // Sort selected products by updated_at ASC so last-sent gets latest created_at (goes to end of queue)
      const selectedItems = products
        .filter(p => ids.includes(p.id))
        .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
      
      for (let i = 0; i < selectedItems.length; i++) {
        const newCreatedAt = new Date(Date.now() + (i + 1) * 1000).toISOString();
        const { error } = await supabase
          .from("products")
          .update({ status: "Scheduled", created_at: newCreatedAt })
          .eq("id", selectedItems[i].id);
        if (error) throw error;
      }
      setProducts((prev) =>
        prev.map((p) => ids.includes(p.id) ? { ...p, status: "Scheduled" as Product["status"] } : p)
      );
      setSelectedManualProducts(new Set());
      toast({ title: `✅ ${ids.length} פריטים הוחזרו לתור` });
    } catch {
      toast({ title: "שגיאה בהחזרה לתור", variant: "destructive" });
    } finally {
      setIsReturningBulk(false);
    }
  };

  const handleDeleteSelected = async () => {
    const toDelete = selectedProducts.size > 0 ? Array.from(selectedProducts) : scheduledProducts.map(p => p.id);
    if (toDelete.length === 0) return;

    setIsDeletingBulk(true);
    try {
      const { error } = await supabase.from("products").delete().in("id", toDelete);
      if (error) throw error;
      setProducts(prev => prev.filter(p => !toDelete.includes(p.id)));
      setSelectedProducts(new Set());
      toast({ title: `🗑️ ${toDelete.length} מוצרים נמחקו` });
    } catch {
      toast({ title: "שגיאה במחיקה", variant: "destructive" });
    } finally {
      setIsDeletingBulk(false);
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

  const handleUpdateCoupons = async () => {
    if (selectedProducts.size === 0) {
      toast({ title: "לא נבחרו מוצרים", variant: "destructive" });
      return;
    }
    setIsUpdatingCoupons(true);
    try {
      // Fetch active campaign
      const { data: campaign } = await supabase
        .from("coupon_campaigns")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!campaign || !campaign.coupons || (campaign.coupons as unknown as Coupon[]).length === 0) {
        toast({ title: "אין קמפיין קופונים פעיל", description: "הגדר קופונים בדף הקופונים", variant: "destructive" });
        return;
      }

      const coupons = campaign.coupons as unknown as Coupon[];
      const exchangeRate = Number(campaign.exchange_rate) || 3.19;
      const selectedItems = products.filter(p => selectedProducts.has(p.id));
      
      let updated = 0;
      let skipped = 0;

      for (const product of selectedItems) {
        const text = product.hebrew_description || "";
        if (!text.trim()) { skipped++; continue; }

        const result = applyCouponToText(text, coupons, exchangeRate);
        if (result.applied) {
          const { error } = await supabase
            .from("products")
            .update({ hebrew_description: result.updatedText })
            .eq("id", product.id);
          if (!error) {
            setProducts(prev => prev.map(p => 
              p.id === product.id ? { ...p, hebrew_description: result.updatedText } : p
            ));
            updated++;
          }
        } else {
          skipped++;
        }
      }

      toast({ 
        title: `✅ עודכנו ${updated} פוסטים`, 
        description: skipped > 0 ? `${skipped} לא עודכנו (אין מחיר/קופון מתאים)` : undefined 
      });
    } catch (e) {
      toast({ title: "שגיאה בעדכון קופונים", variant: "destructive" });
    } finally {
      setIsUpdatingCoupons(false);
    }
  };

  const handleStockChecked = (productId: string, status: string) => {
    setProducts((prev) =>
      prev.map((p) => p.id === productId ? { ...p, stock_status: status as Product['stock_status'], last_stock_check: new Date().toISOString(), auto_disabled: status === 'unavailable' } : p)
    );
  };

  const handleCheckAllStock = async () => {
    if (scheduledProducts.length === 0) return;
    setIsCheckingAllStock(true);

    let checked = 0;
    let unavailable = 0;
    let skipped = 0;
    let failed = 0;

    const isValidHttpUrl = (value: string | null | undefined) => {
      if (!value) return false;
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    };

    const extractUrlFromText = (text: string | null | undefined): string | null => {
      if (!text) return null;
      const match = text.match(/https?:\/\/[^\s\n"<>]+aliexpress[^\s\n"<>]*/i)
        || text.match(/https?:\/\/s\.click\.aliexpress\.com\/e\/[^\s\n"<>]+/i);
      return match ? match[0] : null;
    };

    const resolveCheckUrl = (product: Product): string | null => {
      if (isValidHttpUrl(product.original_url)) return product.original_url;
      if (isValidHttpUrl(product.affiliate_link)) return product.affiliate_link as string;
      return extractUrlFromText(product.hebrew_description) || extractUrlFromText(product.title) || null;
    };

    try {
      const productsToCheck = scheduledProducts
        .map((product) => ({ product, checkUrl: resolveCheckUrl(product) }))
        .filter((item): item is { product: Product; checkUrl: string } => Boolean(item.checkUrl));

      skipped = scheduledProducts.length - productsToCheck.length;
      setStockCheckTotal(productsToCheck.length);
      setStockCheckProgress(0);

      if (productsToCheck.length === 0) {
        toast({
          title: "אין קישורי מוצר תקינים לבדיקה",
          description: `נמצאו ${skipped} מוצרים בלי קישור HTTP/HTTPS מלא`,
          variant: "destructive",
        });
        return;
      }

      // Process in parallel batches of 5
      const BATCH_SIZE = 5;
      for (let i = 0; i < productsToCheck.length; i += BATCH_SIZE) {
        const batch = productsToCheck.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async ({ product, checkUrl }) => {
            const { data, error } = await supabase.functions.invoke("check-product-stock", {
              body: { productId: product.id, url: checkUrl },
            });
            return { productId: product.id, data, error };
          })
        );

        for (const result of results) {
          if (result.status !== "fulfilled") {
            failed++;
            continue;
          }

          if (result.value.error) {
            failed++;
            continue;
          }

          if (result.value.data?.status) {
            handleStockChecked(result.value.productId, result.value.data.status);
            checked++;
            if (result.value.data.status === "unavailable") unavailable++;
          }
        }

        setStockCheckProgress(Math.min(i + BATCH_SIZE, productsToCheck.length));
      }

      toast({
        title: `✅ נבדקו ${checked} מוצרים`,
        description: [
          unavailable > 0 ? `${unavailable} אזלו מהמלאי` : "",
          skipped > 0 ? `${skipped} דולגו (קישור לא תקין)` : "",
          failed > 0 ? `${failed} נכשלו (שגיאת תקשורת)` : "",
        ].filter(Boolean).join(" • ") || "הכל במלאי!",
      });
    } finally {
      setIsCheckingAllStock(false);
      setStockCheckProgress(0);
      setStockCheckTotal(0);
    }
  };

  const scheduledProducts = products.filter((p) => p.status === "Scheduled");
  const sentAutoProducts = products.filter((p) => p.status === "Sent" && p.sent_via !== "manual").sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const sentManualProducts = products.filter((p) => p.status === "Sent" && p.sent_via === "manual").sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const sentProducts = products.filter((p) => p.status === "Sent").sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  // Coupon filter logic
  const couponKeywordRe = /(?:קופון|קופונים|הקופון|coupon|promo\s*code)/i;
  const hasCoupon = (product: Product) => {
    const text = product.hebrew_description || "";
    return detectCouponsInText(text).length > 0 || couponKeywordRe.test(text);
  };
  const displayScheduledProducts = showOnlyCoupons
    ? scheduledProducts.filter(hasCoupon)
    : scheduledProducts;

  const renderProducts = (items: Product[], showSelection: boolean = false, isManualTab: boolean = false) => {
    if (isLoading) {
      return <SkeletonList count={3} />;
    }

    if (items.length === 0) {
      return (
        <EmptyQueue onAdd={() => navigate("/add-product")} />
      );
    }

    const currentSelected = isManualTab ? selectedManualProducts : selectedProducts;
    const currentHandler = isManualTab ? handleManualSelectionChange : handleSelectionChange;

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
              isSelected={currentSelected.has(product.id)}
              onSelectionChange={currentHandler}
              showCheckbox={showSelection}
              onStockChecked={handleStockChecked}
            />
          </div>
        ))}
      </div>
    );
  };

  const allScheduledSelected = displayScheduledProducts.length > 0 && 
    displayScheduledProducts.every(p => selectedProducts.has(p.id));
  const someScheduledSelected = displayScheduledProducts.some(p => selectedProducts.has(p.id));

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
          
          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={handleUpdateCoupons}
              disabled={selectedProducts.size === 0 || isUpdatingCoupons}
              className="gap-2"
            >
              {isUpdatingCoupons ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Ticket className="h-4 w-4" />
              )}
              🎟️ עדכן קופונים ({selectedProducts.size})
            </Button>
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
              ✨ Enhance ({selectedProducts.size})
            </Button>
            <Button
              variant="outline"
              onClick={handleCheckAllStock}
              disabled={isCheckingAllStock || scheduledProducts.length === 0}
              className="gap-2"
            >
              {isCheckingAllStock ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PackageSearch className="h-4 w-4" />
              )}
              {isCheckingAllStock ? `בודק... (${stockCheckProgress}/${stockCheckTotal})` : `בדוק מלאי (${scheduledProducts.length})`}
            </Button>
            {isCheckingAllStock && stockCheckTotal > 0 && (
              <Progress value={(stockCheckProgress / stockCheckTotal) * 100} className="h-2 w-48" />
            )}
          </div>
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
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50 flex-wrap">
                <Checkbox
                  checked={allScheduledSelected}
                  onCheckedChange={(checked) => handleSelectAll(checked === true)}
                  className="h-5 w-5"
                  aria-label="בחר הכל"
                />
                <span className="text-sm font-medium">
                  {allScheduledSelected 
                    ? "בטל בחירה" 
                    : someScheduledSelected 
                      ? `${selectedProducts.size} נבחרו` 
                      : `בחר הכל (${scheduledProducts.length})`
                  }
                </span>
                <div className="mr-auto">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost-destructive"
                        size="sm"
                        disabled={isDeletingBulk}
                        className="gap-2"
                      >
                        {isDeletingBulk ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        {selectedProducts.size > 0 ? `מחק נבחרים (${selectedProducts.size})` : `מחק הכל (${scheduledProducts.length})`}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>אישור מחיקה</AlertDialogTitle>
                        <AlertDialogDescription>
                          {selectedProducts.size > 0
                            ? `האם למחוק ${selectedProducts.size} מוצרים נבחרים? פעולה זו לא ניתנת לביטול.`
                            : `האם למחוק את כל ${scheduledProducts.length} המוצרים בתור? פעולה זו לא ניתנת לביטול.`
                          }
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="flex gap-2">
                        <AlertDialogCancel>ביטול</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteSelected}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          מחק
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
            {renderProducts(scheduledProducts, true)}
          </TabsContent>

          <TabsContent value="sent-auto" className="animate-fade-in">
            {renderProducts(sentAutoProducts, false)}
          </TabsContent>

          <TabsContent value="sent-manual" className="animate-fade-in space-y-4">
            {/* Select All + Return Button */}
            {sentManualProducts.length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50 flex-wrap">
                <Checkbox
                  checked={sentManualProducts.length > 0 && sentManualProducts.every(p => selectedManualProducts.has(p.id))}
                  onCheckedChange={(checked) => handleSelectAllManual(checked === true)}
                  className="h-5 w-5"
                  aria-label="בחר הכל"
                />
                <span className="text-sm font-medium">
                  {sentManualProducts.every(p => selectedManualProducts.has(p.id))
                    ? "בטל בחירה"
                    : selectedManualProducts.size > 0
                      ? `${selectedManualProducts.size} נבחרו`
                      : "בחר הכל"
                  }
                </span>
                <div className="mr-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReturnSelectedToQueue}
                    disabled={selectedManualProducts.size === 0 || isReturningBulk}
                    className="gap-2 border-primary/50 text-primary hover:bg-primary/10"
                  >
                    {isReturningBulk ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                    החזר נבחרים לתור ({selectedManualProducts.size})
                  </Button>
                </div>
              </div>
            )}
            {renderProducts(sentManualProducts, true, true)}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
};

export default Queue;
