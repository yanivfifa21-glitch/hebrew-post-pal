import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Search, Loader2, Sparkles, TrendingUp, Flame, Star, 
  ShoppingBag, RefreshCw, Zap, AlertCircle, Link as LinkIcon,
  FileSpreadsheet
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator, PullToRefreshContainer } from "@/components/ui/pull-to-refresh";
import { ExcelImporter, ExcelProduct } from "@/components/products/ExcelImporter";
import { ExcelProductCard } from "@/components/products/ExcelProductCard";

type HotProduct = {
  product_id: string;
  title: string;
  price: number;
  original_price: number;
  image_url: string;
  sales_count?: number;
  rating?: number;
  product_url: string;
  discount_percent?: number;
};

type ImportedProduct = ExcelProduct & { id: string };

const CATEGORIES = [
  { id: "", label: "הכל", icon: Flame },
  { id: "44", label: "אלקטרוניקה", icon: null },
  { id: "3", label: "בית וגינה", icon: null },
  { id: "200000297", label: "ספורט", icon: null },
  { id: "1503", label: "אופנה גברים", icon: null },
  { id: "1501", label: "אופנה נשים", icon: null },
];

const Discovery = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<HotProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [creatingPostId, setCreatingPostId] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [activeMode, setActiveMode] = useState<"api" | "scrape" | "excel">("api");
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [dataSource, setDataSource] = useState<string>("");
  
  // Excel import state
  const [importedProducts, setImportedProducts] = useState<ImportedProduct[]>([]);
  const [addingProductId, setAddingProductId] = useState<string | null>(null);

  // Pull to refresh handler
  const handlePullRefresh = useCallback(async () => {
    if (activeMode === "api") {
      await fetchHotProductsAsync(selectedCategory, searchQuery);
    } else {
      await fetchScrapedDealsAsync();
    }
  }, [activeMode, selectedCategory, searchQuery]);

  const {
    containerRef,
    pullDistance,
    isRefreshing: isPullRefreshing,
    progress,
    shouldTrigger,
  } = usePullToRefresh({ onRefresh: handlePullRefresh });

  // Async versions for pull-to-refresh

  const fetchHotProductsAsync = async (category = selectedCategory, keywords = "") => {
    setShowManualInput(false);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-hot-products", {
        body: { 
          category, 
          keywords,
          pageSize: 30,
          sort: "LAST_VOLUME_DESC" 
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Failed to fetch products");

      setProducts(data.products);
      setHasFetched(true);
      setDataSource("API");
    } catch (e) {
      toast({
        title: "Failed to Load",
        description: e instanceof Error ? e.message : "Could not load trending products",
        variant: "destructive",
      });
    }
  };

  // Fetch from official API (with loading state)
  const fetchHotProducts = async (category = selectedCategory, keywords = "") => {
    setIsLoading(true);
    await fetchHotProductsAsync(category, keywords);
    setIsLoading(false);
  };

  const fetchScrapedDealsAsync = async () => {
    setShowManualInput(false);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-ali-deals", {
        body: {},
      });

      if (error) throw new Error(error.message);
      
      if (!data?.success) {
        if (data?.fallback) {
          setShowManualInput(true);
          toast({
            title: "הגרידה נחסמה",
            description: "השתמש בהזנה ידנית של קישור מוצר",
            variant: "default",
          });
        } else {
          throw new Error(data?.error || "Failed to scrape deals");
        }
        return;
      }

      setProducts(data.products.map((p: any) => ({
        ...p,
        sales_count: 0,
        rating: 0,
      })));
      setHasFetched(true);
      setDataSource(data.source === "demo" ? "Demo" : "Scraped");
      
      if (data.source === "demo") {
        toast({
          title: "מצב הדגמה",
          description: "מציג נתוני דוגמה - הגרידה נחסמה ע\"י אליאקספרס",
          variant: "default",
        });
      }
    } catch (e) {
      setShowManualInput(true);
      toast({
        title: "Scraping Failed",
        description: "Try entering a product link manually",
        variant: "destructive",
      });
    }
  };

  // Fetch via scraping (with loading state)
  const fetchScrapedDeals = async () => {
    setIsLoading(true);
    await fetchScrapedDealsAsync();
    setIsLoading(false);
  };

  const handleSearch = () => {
    if (activeMode === "api") {
      fetchHotProducts(selectedCategory, searchQuery);
    } else {
      fetchScrapedDeals();
    }
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    if (activeMode === "api") {
      fetchHotProducts(category, searchQuery);
    }
  };

  const handleModeChange = (mode: string) => {
    setActiveMode(mode as "api" | "scrape" | "excel");
    if (mode !== "excel") {
      setProducts([]);
      setHasFetched(false);
    }
    setShowManualInput(false);
  };

  // Excel import handlers
  const handleExcelProductsLoaded = (excelProducts: ExcelProduct[]) => {
    const productsWithId = excelProducts.map((p, idx) => ({
      ...p,
      id: `excel-${idx}-${Date.now()}`
    }));
    setImportedProducts(productsWithId);
    setDataSource("Excel");
  };

  const handleQuickAddFromExcel = async (product: ImportedProduct) => {
    setAddingProductId(product.id);
    try {
      // Generate affiliate link from promotion link
      const { data: affResp, error: affErr } = await supabase.functions.invoke("generate-affiliate-link", {
        body: { productUrl: product.promotionLink },
      });

      if (affErr) throw new Error(affErr.message);
      const affiliateLink = affResp?.success ? affResp.affiliateLink : product.promotionLink;

      // Generate Hebrew description
      const { data: hebResp, error: hebErr } = await supabase.functions.invoke("generate-hebrew-post", {
        body: { 
          title: product.title,
          ordersCount: 0,
          rating: 0,
          originalPrice: product.originalPrice,
          discountPrice: product.discountPrice,
          discountPercent: product.discountPercent,
          couponCode: product.codeName,
          couponValue: product.codeValue,
        },
      });

      if (hebErr) throw new Error(hebErr.message);
      if (!hebResp?.success) throw new Error(hebResp?.error || "Failed to generate Hebrew content");

      const hebrewDescription = `${hebResp.hebrewDescription}\n\n👉 לרכישה: ${affiliateLink}`;

      // Save to queue
      const { error: saveErr } = await supabase.from("products").insert({
        original_url: product.promotionLink,
        title: product.title,
        price: product.discountPrice,
        image_url: product.imageUrl,
        orders_count: 0,
        rating: 0,
        affiliate_link: affiliateLink,
        hebrew_description: hebrewDescription,
        status: "queued",
        channels: [],
      });

      if (saveErr) throw new Error(saveErr.message);

      toast({
        title: "✨ נוסף לתור!",
        description: "הפוסט נוצר ונוסף לתור הפרסום שלך",
      });

      // Remove from imported list
      setImportedProducts(prev => prev.filter(p => p.id !== product.id));
    } catch (e) {
      toast({
        title: "Creation Failed",
        description: e instanceof Error ? e.message : "Could not create post",
        variant: "destructive",
      });
    } finally {
      setAddingProductId(null);
    }
  };

  const handleEditFromExcel = (product: ImportedProduct) => {
    // Navigate to add product page with pre-filled data
    const params = new URLSearchParams({
      url: product.promotionLink,
      title: product.title,
      price: product.discountPrice.toString(),
      originalPrice: product.originalPrice.toString(),
      imageUrl: product.imageUrl,
      couponCode: product.codeName || "",
      couponValue: product.codeValue || "",
    });
    navigate(`/add?${params.toString()}`);
  };

  const handleManualAdd = async () => {
    if (!manualUrl.trim()) return;
    
    setCreatingPostId("manual");
    try {
      // Use the existing fetch-ali-product function
      const { data: productData, error: productErr } = await supabase.functions.invoke("fetch-ali-product", {
        body: { productUrl: manualUrl },
      });

      if (productErr) throw new Error(productErr.message);
      if (!productData?.success) throw new Error(productData?.error || "Failed to fetch product");

      // Create post from fetched data
      await handleCreatePost({
        product_id: productData.productId || "manual",
        title: productData.data.title,
        price: productData.data.price,
        original_price: productData.data.price,
        image_url: productData.data.image_url,
        sales_count: productData.data.orders_count,
        rating: productData.data.rating,
        product_url: productData.cleanUrl || manualUrl,
      });

      setManualUrl("");
    } catch (e) {
      toast({
        title: "Failed",
        description: e instanceof Error ? e.message : "Could not process product",
        variant: "destructive",
      });
    } finally {
      setCreatingPostId(null);
    }
  };

  const handleCreatePost = async (product: HotProduct) => {
    setCreatingPostId(product.product_id);
    try {
      // 1. Generate affiliate link
      const { data: affResp, error: affErr } = await supabase.functions.invoke("generate-affiliate-link", {
        body: { productUrl: product.product_url },
      });

      if (affErr) throw new Error(affErr.message);
      const affiliateLink = affResp?.success ? affResp.affiliateLink : product.product_url;

      // 2. Generate Hebrew description
      const { data: hebResp, error: hebErr } = await supabase.functions.invoke("generate-hebrew-post", {
        body: { 
          title: product.title,
          ordersCount: product.sales_count || 0,
          rating: product.rating || 0,
        },
      });

      if (hebErr) throw new Error(hebErr.message);
      if (!hebResp?.success) throw new Error(hebResp?.error || "Failed to generate Hebrew content");

      const hebrewDescription = `${hebResp.hebrewDescription}\n\n👉 לרכישה: ${affiliateLink}`;

      // Normalize rating to 0-5 scale
      let normalizedRating = product.rating ?? 0;
      if (normalizedRating > 5) {
        normalizedRating = normalizedRating / 20;
      }
      normalizedRating = Math.min(normalizedRating, 5);

      // 3. Save to queue
      const { error: saveErr } = await supabase.from("products").insert({
        original_url: product.product_url,
        title: product.title,
        price: product.price,
        image_url: product.image_url,
        orders_count: product.sales_count || 0,
        rating: normalizedRating,
        affiliate_link: affiliateLink,
        hebrew_description: hebrewDescription,
        status: "queued",
        channels: [],
      });

      if (saveErr) throw new Error(saveErr.message);

      toast({
        title: "✨ נוסף לתור!",
        description: "הפוסט נוצר ונוסף לתור הפרסום שלך",
      });
    } catch (e) {
      toast({
        title: "Creation Failed",
        description: e instanceof Error ? e.message : "Could not create post",
        variant: "destructive",
      });
    } finally {
      setCreatingPostId(null);
    }
  };

  const filteredProducts = products.filter(p => 
    !searchQuery || p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <MainLayout>
      <PullToRefreshContainer ref={containerRef} className="md:overflow-visible">
        <PullToRefreshIndicator
          pullDistance={pullDistance}
          isRefreshing={isPullRefreshing}
          progress={progress}
          shouldTrigger={shouldTrigger}
        />
        <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
              <Flame className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              <span className="gradient-text">🔥 Super Deals</span>
            </h1>
            {dataSource && (
              <Badge variant="outline" className="text-xs">
                {dataSource}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm md:text-base">גלה מבצעים חמים ומוצרים טרנדיים</p>
        </div>

        {/* Mode Tabs */}
        <Tabs value={activeMode} onValueChange={handleModeChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="api" className="gap-1 md:gap-2 text-xs md:text-sm px-2 md:px-4">
              <TrendingUp className="h-3.5 w-3.5 md:h-4 md:w-4" />
              <span className="hidden xs:inline">Hot</span> API
            </TabsTrigger>
            <TabsTrigger value="scrape" className="gap-1 md:gap-2 text-xs md:text-sm px-2 md:px-4">
              <Zap className="h-3.5 w-3.5 md:h-4 md:w-4" />
              Super Deals
            </TabsTrigger>
            <TabsTrigger value="excel" className="gap-1 md:gap-2 text-xs md:text-sm px-2 md:px-4">
              <FileSpreadsheet className="h-3.5 w-3.5 md:h-4 md:w-4" />
              Excel
            </TabsTrigger>
          </TabsList>

          {/* API Mode Content */}
          <TabsContent value="api" className="space-y-3 mt-3">
            <div className="glass-card neon-border p-3 md:p-4 space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="חפש מוצרים..."
                    className="pl-10 text-right h-10 md:h-11"
                    dir="rtl"
                  />
                </div>
                <Button onClick={handleSearch} disabled={isLoading} variant="gradient" size="icon" className="h-10 w-10 md:h-11 md:w-11 md:w-auto md:px-4">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {/* Categories - horizontal scroll on mobile */}
              <div className="overflow-x-auto -mx-3 px-3 scrollbar-hide">
                <div className="flex gap-2 min-w-max pb-1">
                  {CATEGORIES.map((cat) => (
                    <Button
                      key={cat.id}
                      variant={selectedCategory === cat.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleCategoryChange(cat.id)}
                      className="gap-1.5 text-xs whitespace-nowrap flex-shrink-0"
                    >
                      {cat.icon && <cat.icon className="h-3.5 w-3.5" />}
                      {cat.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Scrape Mode Content */}
          <TabsContent value="scrape" className="space-y-4 mt-4">
            <div className="glass-card neon-border p-4 space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  onClick={fetchScrapedDeals} 
                  disabled={isLoading} 
                  variant="gradient"
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      מחפש מבצעים...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      רענן מבצעים
                    </>
                  )}
                </Button>
              </div>

              {/* Manual Input Fallback */}
              {showManualInput && (
                <div className="border border-dashed border-primary/50 rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="h-4 w-4" />
                    <span>הגרידה נחסמה - הזן קישור מוצר ידנית</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      placeholder="https://www.aliexpress.com/item/..."
                      className="flex-1"
                      dir="ltr"
                    />
                    <Button 
                      onClick={handleManualAdd}
                      disabled={creatingPostId === "manual" || !manualUrl.trim()}
                      variant="outline"
                    >
                      {creatingPostId === "manual" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <LinkIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Excel Import Mode */}
          <TabsContent value="excel" className="space-y-4 mt-4">
            <div className="glass-card neon-border p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="h-5 w-5 text-green-500" />
                <h3 className="font-semibold text-foreground">ייבוא מקובץ Excel</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                העלה קובץ Excel עם מוצרים - התומך בכותרות גמישות (Title, Image, Price וכו')
              </p>
              <ExcelImporter 
                onProductsLoaded={handleExcelProductsLoaded} 
                onClearAll={() => setImportedProducts([])}
                hasProducts={importedProducts.length > 0}
              />
            </div>

            {/* Imported Products Grid */}
            {importedProducts.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">
                    מוצרים מיובאים ({importedProducts.length})
                  </h3>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {importedProducts.map((product) => (
                    <ExcelProductCard
                      key={product.id}
                      product={product}
                      onQuickAdd={() => handleQuickAddFromExcel(product)}
                      onEdit={() => handleEditFromExcel(product)}
                      isAdding={addingProductId === product.id}
                    />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Initial State - only for API/Scrape modes */}
        {activeMode !== "excel" && !hasFetched && !isLoading && !showManualInput && (
          <div className="glass-card neon-border p-12 text-center">
            <Flame className="h-16 w-16 text-primary/50 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">
              {activeMode === "api" ? "גלה מוצרים חמים" : "גלה סופר דילים"}
            </h3>
            <p className="text-muted-foreground mb-6">
              {activeMode === "api" 
                ? "בחר קטגוריה או חפש מוצרים כדי להתחיל"
                : "לחץ על 'רענן מבצעים' כדי לגלות דילים חמים"
              }
            </p>
            <Button onClick={activeMode === "api" ? () => fetchHotProducts() : fetchScrapedDeals} variant="gradient" size="lg">
              {activeMode === "api" ? (
                <>
                  <TrendingUp className="h-5 w-5 mr-2" />
                  טען מוצרים פופולריים
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5 mr-2" />
                  חפש סופר דילים
                </>
              )}
            </Button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            <div className="glass-card neon-border p-8 text-center">
              <Loader2 className="h-12 w-12 text-primary mx-auto mb-4 animate-spin" />
              <p className="text-lg font-medium text-foreground">מחפש את הדילים הכי טובים...</p>
              <p className="text-sm text-muted-foreground mt-2">זה עשוי לקחת מספר שניות</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="glass-card p-3 md:p-4 animate-pulse">
                  <div className="aspect-square bg-muted rounded-lg mb-2 md:mb-3" />
                  <div className="h-3 md:h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 md:h-4 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Products Grid */}
        {!isLoading && hasFetched && (
          <>
            {filteredProducts.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <p className="text-muted-foreground">לא נמצאו מוצרים</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-4">
                {filteredProducts.map((product) => (
                  <div key={product.product_id} className="glass-card neon-border overflow-hidden group active:scale-[0.98] md:hover:scale-[1.02] transition-all duration-300">
                    {/* Image */}
                    <div className="relative aspect-square overflow-hidden">
                      <img
                        src={product.image_url}
                        alt={product.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/placeholder.svg";
                        }}
                      />
                      {product.discount_percent && product.discount_percent > 30 && (
                        <Badge className="absolute top-1 left-1 md:top-2 md:left-2 bg-destructive/90 text-[10px] md:text-xs px-1.5 md:px-2">
                          -{product.discount_percent}%
                        </Badge>
                      )}
                      {(product.sales_count || 0) > 100 && !product.discount_percent && (
                        <Badge className="absolute top-1 left-1 md:top-2 md:left-2 bg-destructive/90 text-[10px] md:text-xs px-1.5 md:px-2">
                          <Flame className="h-2.5 w-2.5 md:h-3 md:w-3 mr-0.5" />
                          חם
                        </Badge>
                      )}
                      {(product.rating || 0) > 4.5 && (
                        <Badge className="absolute top-1 right-1 md:top-2 md:right-2 bg-primary/90 text-[10px] md:text-xs px-1.5 md:px-2">
                          <Star className="h-2.5 w-2.5 md:h-3 md:w-3 mr-0.5" />
                          {(product.rating || 0).toFixed(1)}
                        </Badge>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-2 md:p-4 space-y-2 md:space-y-3">
                      <h3 className="font-medium text-foreground line-clamp-2 text-xs md:text-sm leading-snug min-h-[2.5em]">
                        {product.title}
                      </h3>

                      <div className="flex items-center justify-between">
                        <div className="flex flex-col md:flex-row md:items-baseline gap-0.5 md:gap-2">
                          <span className="text-sm md:text-lg font-bold text-primary">
                            ${product.price.toFixed(2)}
                          </span>
                          {product.original_price > product.price && (
                            <span className="text-[10px] md:text-xs text-muted-foreground line-through">
                              ${product.original_price.toFixed(2)}
                            </span>
                          )}
                        </div>
                        {(product.sales_count || 0) > 0 && (
                          <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                            <ShoppingBag className="h-3 w-3" />
                            {(product.sales_count || 0).toLocaleString()}
                          </div>
                        )}
                      </div>

                      <Button
                        variant="gradient"
                        size="sm"
                        className="w-full h-8 md:h-9 text-xs md:text-sm"
                        onClick={() => handleCreatePost(product)}
                        disabled={creatingPostId === product.product_id}
                      >
                        {creatingPostId === product.product_id ? (
                          <>
                            <Loader2 className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2 animate-spin" />
                            <span className="hidden md:inline">יוצר פוסט...</span>
                            <span className="md:hidden">מעבד...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3 w-3 md:h-4 md:w-4 mr-1 md:mr-2" />
                            <span className="hidden md:inline">הוסף מהיר</span>
                            <span className="md:hidden">הוסף</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        </div>
      </PullToRefreshContainer>
    </MainLayout>
  );
};

export default Discovery;
