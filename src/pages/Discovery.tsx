import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Search, Loader2, Sparkles, TrendingUp, Flame, Star, 
  ShoppingBag, RefreshCw, Zap, AlertCircle, Link as LinkIcon,
  FileSpreadsheet, CheckCircle2, ListPlus, Percent, Filter, SlidersHorizontal, Send
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { PullToRefreshIndicator, PullToRefreshContainer } from "@/components/ui/pull-to-refresh";
import { ExcelImporter, ExcelProduct } from "@/components/products/ExcelImporter";
import { ExcelProductCard } from "@/components/products/ExcelProductCard";
import { ZoneSelector } from "@/components/products/ZoneSelector";

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
  commission_rate?: number;
  source?: string;
};

type ImportedProduct = ExcelProduct & { id: string };

// Product sources for AD CENTER / Campaigns
type ProductSource = "hot" | "hot_deals" | "high_commission" | "featured" | "campaigns";

const PRODUCT_SOURCES = [
  { id: "hot", label: "מוצרים לוהטים", icon: Flame, emoji: "🔥" },
  { id: "hot_deals", label: "Hot Deals", icon: Zap, emoji: "⚡" },
  { id: "high_commission", label: "עמלה גבוהה", icon: Percent, emoji: "💰" },
  { id: "campaigns", label: "קמפיינים", icon: TrendingUp, emoji: "📈" },
];

// Hebrew category mapping with AliExpress category IDs and icons
import { Smartphone, Home, Heart, Dumbbell, Car, Lightbulb, Monitor, Headphones } from "lucide-react";

const CATEGORIES = [
  { id: "", label: "הכל", icon: Flame, emoji: "🔥" },
  { id: "509", label: "אלקטרוניקה ומובייל", icon: Smartphone, emoji: "📱" },
  { id: "15", label: "בית חכם ואביזרים", icon: Home, emoji: "🏠" },
  { id: "66", label: "טיפוח ובריאות", icon: Heart, emoji: "💄" },
  { id: "200000297", label: "כושר וספורט", icon: Dumbbell, emoji: "💪" },
  { id: "34", label: "רכב ואביזרים", icon: Car, emoji: "🚗" },
  { id: "200003482", label: "גאדג׳טים ויראליים", icon: Lightbulb, emoji: "💡" },
  { id: "7", label: "מחשבים וציוד", icon: Monitor, emoji: "💻" },
  { id: "44", label: "אודיו ולבישה", icon: Headphones, emoji: "🎧" },
];

const STORAGE_KEY = "aliaffilio_imported_products";

const Discovery = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<HotProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [creatingPostId, setCreatingPostId] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [activeMode, setActiveMode] = useState<"api" | "excel">("api");
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [dataSource, setDataSource] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  
  // Product source state (for AD CENTER categories)
  const [productSource, setProductSource] = useState<ProductSource>("hot");
  
  // Price filter state
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(500);
  const [showFilters, setShowFilters] = useState(false);
  
  // Excel import state - with localStorage persistence
  const [importedProducts, setImportedProducts] = useState<ImportedProduct[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Channel selection for Excel import
  const [excelTargetChannels, setExcelTargetChannels] = useState<string[]>([]); // empty = all/general
  const [messagingAccounts, setMessagingAccounts] = useState<Array<{
    id: string;
    account_type: string;
    account_name: string;
    is_active: boolean;
  }>>([]);
  
  // Multi-select state (used for both Excel and API products)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [isAddingSelected, setIsAddingSelected] = useState(false);
  
  // API products selection state
  const [selectedApiProductIds, setSelectedApiProductIds] = useState<Set<string>>(new Set());
  
  // Zone selection for destination
  const [selectedZones, setSelectedZones] = useState<string[]>([]);

  // Get current user ID on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch messaging accounts for channel selection
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const { data } = await supabase.rpc("get_my_messaging_accounts_safe");
        if (data) {
          const configured = (data as any[]).filter((acc) => {
            if (acc.account_type === "telegram") return acc.has_bot_token && acc.telegram_chat_id;
            if (acc.account_type === "whatsapp") return acc.has_api_token && acc.has_instance_id && acc.whatsapp_chat_id;
            return false;
          });
          setMessagingAccounts(configured);
        }
      } catch (e) {
        console.error("Error fetching messaging accounts:", e);
      }
    };
    fetchAccounts();
  }, []);

  // Persist imported products to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(importedProducts));
    } catch (e) {
      console.warn("Failed to save to localStorage:", e);
    }
  }, [importedProducts]);

  // Pull to refresh handler
  const handlePullRefresh = useCallback(async () => {
    if (activeMode === "api") {
      await fetchHotProductsAsync(selectedCategory, searchQuery);
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

  const fetchHotProductsAsync = async (category = selectedCategory, keywords = "", page = 1, append = false, source: ProductSource = productSource) => {
    setShowManualInput(false);
    try {
      const trimmedKeywords = keywords.trim();

      // If user typed keywords, use the general search endpoint
      const fnName = trimmedKeywords ? "search-ali-products" : "fetch-hot-products";

      const { data, error } = await supabase.functions.invoke(fnName, {
        body: {
          category,
          keywords: trimmedKeywords,
          pageSize: 20,
          pageNo: page,
          sort: "VOLUME_DESC",
          source: source, // Pass the product source for AD CENTER
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Failed to fetch products");

      const newProducts = data.products || [];
      
      if (append) {
        // Filter out duplicates when appending
        setProducts(prev => {
          const existingIds = new Set(prev.map(p => p.product_id));
          const uniqueNew = newProducts.filter((p: HotProduct) => !existingIds.has(p.product_id));
          return [...prev, ...uniqueNew];
        });
      } else {
        setProducts(newProducts);
      }
      
      setHasFetched(true);
      setCurrentPage(page);
      setHasMoreProducts(newProducts.length >= 15);
      
      // Set data source label
      const sourceLabels: Record<ProductSource, string> = {
        hot: "מוצרים לוהטים",
        hot_deals: "Hot Deals",
        high_commission: "עמלה גבוהה",
        featured: "מוצרים מומלצים",
        campaigns: "קמפיינים",
      };
      setDataSource(trimmedKeywords ? "חיפוש" : sourceLabels[source]);
    } catch (e) {
      toast({
        title: "שגיאה בטעינה",
        description: e instanceof Error ? e.message : "לא הצלחנו לטעון מוצרים",
        variant: "destructive",
      });
    }
  };

  // Fetch from official API (with loading state)
  const fetchHotProducts = async (category = selectedCategory, keywords = "", page = 1, append = false, source: ProductSource = productSource) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    await fetchHotProductsAsync(category, keywords, page, append, source);
    setIsLoading(false);
    setIsLoadingMore(false);
  };

  const handleSearch = () => {
    if (activeMode === "api") {
      setCurrentPage(1);
      fetchHotProducts(selectedCategory, searchQuery, 1, false);
    }
  };

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setCurrentPage(1);
    if (activeMode === "api") {
      fetchHotProducts(category, searchQuery, 1, false, productSource);
    }
  };
  
  const handleSourceChange = (source: ProductSource) => {
    setProductSource(source);
    setSelectedCategory(""); // Reset category when changing source
    setCurrentPage(1);
    if (activeMode === "api") {
      fetchHotProducts("", searchQuery, 1, false, source);
    }
  };
  
  const handleLoadMore = () => {
    if (!isLoadingMore && hasMoreProducts) {
      const nextPage = currentPage + 1;
      fetchHotProducts(selectedCategory, searchQuery, nextPage, true);
    }
  };

  const handleModeChange = (mode: string) => {
    setActiveMode(mode as "api" | "excel");
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

  const handleClearAll = () => {
    setImportedProducts([]);
    setSelectedProductIds(new Set());
    localStorage.removeItem(STORAGE_KEY);
    toast({
      title: "נמחקו",
      description: "כל המוצרים המיובאים נמחקו",
    });
  };

  // Toggle product selection (Excel)
  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  // Select/deselect all (Excel)
  const toggleSelectAll = () => {
    if (selectedProductIds.size === importedProducts.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(importedProducts.map(p => p.id)));
    }
  };
  
  // Apply filters - price only (quality filtering done server-side)
  const filteredProducts = products.filter(p => {
    // Price filter
    if (minPrice > 0 && p.price < minPrice) return false;
    if (maxPrice < 500 && p.price > maxPrice) return false;
    
    // High commission filter: only show 8%+ commission products
    if (productSource === "high_commission" && (p.commission_rate || 0) < 8) return false;
    
    return true;
  });

  // Toggle API product selection
  const toggleApiProductSelection = (productId: string) => {
    setSelectedApiProductIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  // Select/deselect all API products
  const toggleSelectAllApi = () => {
    if (selectedApiProductIds.size === filteredProducts.length) {
      setSelectedApiProductIds(new Set());
    } else {
      setSelectedApiProductIds(new Set(filteredProducts.map(p => p.product_id)));
    }
  };

  // Add selected API products to queue
  const handleAddSelectedApiToQueue = async () => {
    if (!userId || selectedApiProductIds.size === 0) return;

    setIsAddingSelected(true);
    const selectedProducts = filteredProducts.filter(p => selectedApiProductIds.has(p.product_id));
    let successCount = 0;
    let failCount = 0;

    for (const product of selectedProducts) {
      try {
        // 1. Generate affiliate link
        const { data: affResp, error: affErr } = await supabase.functions.invoke("generate-affiliate-link", {
          body: { productUrl: product.product_url, userId },
        });

        if (affErr) throw new Error(affErr.message);
        const affiliateLink = affResp?.success ? affResp.affiliateLink : product.product_url;

        // 2. Generate Hebrew description with random prompt style (1-4)
        const { data: hebResp, error: hebErr } = await supabase.functions.invoke("generate-hebrew-post", {
          body: { 
            title: product.title,
            ordersCount: product.sales_count || 0,
            rating: product.rating || 0,
            userId,
          },
        });

        if (hebErr) throw new Error(hebErr.message);
        if (!hebResp?.success) throw new Error(hebResp?.error || "Failed to generate Hebrew content");

        const ctaOptions = ["לרכישה", "להזמנה", "להזמנה מאליאקספרס"];
        const randomCta = ctaOptions[Math.floor(Math.random() * ctaOptions.length)];
        const hebrewDescription = `${hebResp.hebrewDescription}\n\n👇 ${randomCta}:\n${affiliateLink}`;

        // Normalize rating to 0-5 scale
        let normalizedRating = product.rating ?? 0;
        if (normalizedRating > 5) {
          normalizedRating = normalizedRating / 20;
        }
        normalizedRating = Math.min(normalizedRating, 5);

        // 3. Save to queue
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

        // 4. Assign to zones if selected
        if (selectedZones.length > 0 && savedProduct) {
          const zoneInserts = selectedZones.map(zoneId => ({
            zone_id: zoneId,
            product_id: savedProduct.id,
            status: "Scheduled",
          }));
          await supabase.from("zone_products").insert(zoneInserts);
        }
        successCount++;
      } catch (e) {
        console.error(`Failed to add product ${product.title}:`, e);
        failCount++;
      }
    }

    // Clear selection
    setSelectedApiProductIds(new Set());

    toast({
      title: `✨ נוספו ${successCount} מוצרים לתור!`,
      description: failCount > 0 ? `${failCount} נכשלו` : "כל המוצרים נוספו בהצלחה עם פרומפטים שונים",
    });

    setIsAddingSelected(false);
  };

  // Add selected products to queue
  const handleAddSelectedToQueue = async () => {
    if (!userId || selectedProductIds.size === 0) return;

    setIsAddingSelected(true);
    const selectedProducts = importedProducts.filter(p => selectedProductIds.has(p.id));
    let successCount = 0;
    let failCount = 0;

    for (const product of selectedProducts) {
      try {
        // IMPORTANT: keep the affiliate link coming from Excel (Promotion Url)
        const affiliateLink = product.affiliateLink || product.promotionLink;

        // Always generate Hebrew from Product Desc (English) unless Excel already contains Hebrew (rare)
        let hebrewDescription = product.hebrewDescription || "";

        if (!hebrewDescription) {
          const { data: hebResp, error: hebErr } = await supabase.functions.invoke("generate-hebrew-post", {
            body: {
              title: product.title, // mapped from Product Desc
              ordersCount: product.sales180Day || 0,
              rating: product.positiveFeedback || 0, // percent (0-100)
              userId,
            },
          });

          if (hebErr) throw hebErr;
          if (!hebResp?.success) throw new Error(hebResp?.error || "Failed to generate Hebrew content");
          hebrewDescription = hebResp.hebrewDescription;
          
          // Only add stats for promptStyle 1 (the structured format with rating/orders)
          if (hebResp.promptStyle === 1 && (product.sales180Day || product.positiveFeedback)) {
            const stats: string[] = [];
            if (product.sales180Day) stats.push(`📦 מעל ${product.sales180Day.toLocaleString()} הזמנות`);
            if (product.positiveFeedback) {
              // Convert percentage to 5-star rating
              const rating5 = Math.min(5, product.positiveFeedback / 20);
              stats.push(`⭐ דירוג: ${rating5.toFixed(1)} מתוך 5`);
            }
            if (stats.length > 0 && !hebrewDescription.includes('דירוג') && !hebrewDescription.includes('הזמנות')) {
              hebrewDescription = `${hebrewDescription}\n\n${stats.join('\n')}`;
            }
          }
        }

        const ctaOptionsExcel = ["לרכישה", "להזמנה", "להזמנה מאליאקספרס"];
        const randomCtaExcel = ctaOptionsExcel[Math.floor(Math.random() * ctaOptionsExcel.length)];
        const finalDescription = `${hebrewDescription}\n\n👇 ${randomCtaExcel}:\n${affiliateLink}`;

        // Save to queue
        const { data: savedProduct, error: saveErr } = await supabase.from("products").insert({
          original_url: product.promotionLink,
          title: product.title,
          price: null,
          image_url: product.imageUrl,
          orders_count: product.sales180Day || 0,
          rating: product.positiveFeedback ? product.positiveFeedback / 20 : 0,
          affiliate_link: affiliateLink,
          hebrew_description: finalDescription,
          status: "Scheduled",
          channels: excelTargetChannels.length > 0 ? excelTargetChannels : [],
          user_id: userId,
        }).select("id").single();

        if (saveErr) throw saveErr;

        // Assign to zones if selected
        if (selectedZones.length > 0 && savedProduct) {
          const zoneInserts = selectedZones.map(zoneId => ({
            zone_id: zoneId,
            product_id: savedProduct.id,
            status: "Scheduled",
          }));
          await supabase.from("zone_products").insert(zoneInserts);
        }
        successCount++;
      } catch (e) {
        console.error(`Failed to add product ${product.title}:`, e);
        failCount++;
      }
    }

    // Remove successfully added products
    const addedIds = new Set(
      selectedProducts
        .filter((_, i) => i < successCount)
        .map(p => p.id)
    );
    
    // Actually remove all selected since we processed them
    setImportedProducts(prev => prev.filter(p => !selectedProductIds.has(p.id)));
    setSelectedProductIds(new Set());

    toast({
      title: `✨ נוספו ${successCount} מוצרים לתור!`,
      description: failCount > 0 ? `${failCount} נכשלו` : "כל המוצרים נוספו בהצלחה",
      variant: failCount > 0 ? "default" : "default",
    });

    setIsAddingSelected(false);
  };

  const handleQuickAddFromExcel = async (product: ImportedProduct) => {
    if (!userId) {
      toast({
        title: "Not Authenticated",
        description: "Please log in to add products",
        variant: "destructive",
      });
      return;
    }

    setAddingProductId(product.id);
    try {
      // IMPORTANT: keep the affiliate link coming from Excel (Promotion Url)
      const affiliateLink = product.affiliateLink || product.promotionLink;

      // Use existing Hebrew description from Excel if available, otherwise generate from Product Desc
      let hebrewDescription = product.hebrewDescription || "";
      let promptStyle = 1; // default

      if (!hebrewDescription) {
        const { data: hebResp, error: hebErr } = await supabase.functions.invoke("generate-hebrew-post", {
          body: {
            title: product.title,
            ordersCount: product.sales180Day || 0,
            rating: product.positiveFeedback || 0, // percent (0-100)
            userId,
          },
        });

        if (hebErr) throw new Error(hebErr.message);
        if (!hebResp?.success) throw new Error(hebResp?.error || "Failed to generate Hebrew content");
        hebrewDescription = hebResp.hebrewDescription;
        promptStyle = hebResp.promptStyle || 1;
      }

      // Only add stats for promptStyle 1 (the structured format with rating/orders)
      if (promptStyle === 1 && (product.sales180Day || product.positiveFeedback)) {
        const stats: string[] = [];
        if (product.sales180Day) stats.push(`📦 מעל ${product.sales180Day.toLocaleString()} הזמנות`);
        if (product.positiveFeedback) {
          // Convert percentage to 5-star rating
          const rating5 = Math.min(5, product.positiveFeedback / 20);
          stats.push(`⭐ דירוג: ${rating5.toFixed(1)} מתוך 5`);
        }
        if (stats.length > 0 && !hebrewDescription.includes('דירוג') && !hebrewDescription.includes('הזמנות')) {
          hebrewDescription = `${hebrewDescription}\n\n${stats.join('\n')}`;
        }
      }

      // Add affiliate link at the end with random CTA
      const ctaOptionsQuick = ["לרכישה", "להזמנה", "להזמנה מאליאקספרס"];
      const randomCtaQuick = ctaOptionsQuick[Math.floor(Math.random() * ctaOptionsQuick.length)];
      const finalDescription = `${hebrewDescription}\n\n👇 ${randomCtaQuick}:\n${affiliateLink}`;

      // Save to queue
      const { data: savedProduct, error: saveErr } = await supabase.from("products").insert({
        original_url: product.promotionLink,
        title: product.title,
        price: null,
        image_url: product.imageUrl,
        orders_count: product.sales180Day || 0,
        rating: product.positiveFeedback ? product.positiveFeedback / 20 : 0,
        affiliate_link: affiliateLink,
        hebrew_description: finalDescription,
        status: "Scheduled",
        channels: excelTargetChannels.length > 0 ? excelTargetChannels : [],
        user_id: userId,
      }).select("id").single();

      if (saveErr) throw new Error(saveErr.message);

      // Assign to zones if selected
      if (selectedZones.length > 0 && savedProduct) {
        const zoneInserts = selectedZones.map(zoneId => ({
          zone_id: zoneId,
          product_id: savedProduct.id,
          status: "Scheduled",
        }));
        await supabase.from("zone_products").insert(zoneInserts);
      }

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
    if (!userId) {
      toast({
        title: "Not Authenticated",
        description: "Please log in to add products",
        variant: "destructive",
      });
      return;
    }

    setCreatingPostId(product.product_id);
    try {
      // 1. Generate affiliate link
      const { data: affResp, error: affErr } = await supabase.functions.invoke("generate-affiliate-link", {
        body: { productUrl: product.product_url, userId },
      });

      if (affErr) throw new Error(affErr.message);
      const affiliateLink = affResp?.success ? affResp.affiliateLink : product.product_url;

      // 2. Generate Hebrew description - PASS userId to fetch custom prompt
      const { data: hebResp, error: hebErr } = await supabase.functions.invoke("generate-hebrew-post", {
        body: { 
          title: product.title,
          ordersCount: product.sales_count || 0,
          rating: product.rating || 0,
          userId, // Critical: pass userId to fetch custom prompt
        },
      });

      if (hebErr) throw new Error(hebErr.message);
      if (!hebResp?.success) throw new Error(hebResp?.error || "Failed to generate Hebrew content");

      const ctaOptionsSingle = ["לרכישה", "להזמנה", "להזמנה מאליאקספרס"];
      const randomCtaSingle = ctaOptionsSingle[Math.floor(Math.random() * ctaOptionsSingle.length)];
      const hebrewDescription = `${hebResp.hebrewDescription}\n\n👇 ${randomCtaSingle}:\n${affiliateLink}`;

      // Normalize rating to 0-5 scale
      let normalizedRating = product.rating ?? 0;
      if (normalizedRating > 5) {
        normalizedRating = normalizedRating / 20;
      }
      normalizedRating = Math.min(normalizedRating, 5);

      // 3. Save to queue
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

      // 4. Assign to zones if selected
      if (selectedZones.length > 0 && savedProduct) {
        const zoneInserts = selectedZones.map(zoneId => ({
          zone_id: zoneId,
          product_id: savedProduct.id,
          status: "Scheduled",
        }));
        await supabase.from("zone_products").insert(zoneInserts);
      }

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
              <Flame className="h-6 w-6 md:h-8 md:w-8 text-primary animate-pulse-soft" />
              <span className="gradient-text">🔥 מוצרים לוהטים</span>
            </h1>
            {dataSource && (
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                {dataSource}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm md:text-base">20 המוצרים הכי נמכרים בכל קטגוריה</p>
        </div>

        {/* Mode Tabs */}
        <Tabs value={activeMode} onValueChange={handleModeChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-card/50 backdrop-blur-sm border border-border/50">
            <TabsTrigger value="api" className="gap-1 md:gap-2 text-xs md:text-sm px-2 md:px-4 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              <Flame className="h-3.5 w-3.5 md:h-4 md:w-4" />
              מוצרים לוהטים
            </TabsTrigger>
            <TabsTrigger value="excel" className="gap-1 md:gap-2 text-xs md:text-sm px-2 md:px-4 data-[state=active]:bg-success/20 data-[state=active]:text-success">
              <FileSpreadsheet className="h-3.5 w-3.5 md:h-4 md:w-4" />
              Excel
            </TabsTrigger>
          </TabsList>

          {/* API Mode Content */}
          <TabsContent value="api" className="space-y-3 mt-3">
            <div className="glass-card neon-border p-3 md:p-4 space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 relative neon-input rounded-xl">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="חפש מוצרים..."
                    className="pl-10 text-right h-10 md:h-11 bg-input/50 border-border/50"
                    dir="rtl"
                  />
                </div>
                <Button 
                  onClick={() => setShowFilters(!showFilters)} 
                  variant={showFilters ? "secondary" : "outline"} 
                  size="icon" 
                  className="h-10 w-10 md:h-11 md:w-11"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </Button>
                <Button onClick={handleSearch} disabled={isLoading} variant="gradient" size="icon" className="h-10 w-10 md:h-11 md:w-11 md:w-auto md:px-4">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {/* Price Filter Panel */}
              {showFilters && (
                <div className="p-3 bg-muted/30 rounded-lg border border-border/50 space-y-3" dir="rtl">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      סינון לפי מחיר
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ${minPrice} - ${maxPrice === 500 ? '∞' : maxPrice}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-muted-foreground">מינימום</label>
                      <Input
                        type="number"
                        value={minPrice}
                        onChange={(e) => setMinPrice(Math.max(0, parseInt(e.target.value) || 0))}
                        className="h-8 text-sm"
                        min={0}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className="text-xs text-muted-foreground">מקסימום</label>
                      <Input
                        type="number"
                        value={maxPrice}
                        onChange={(e) => setMaxPrice(Math.max(1, parseInt(e.target.value) || 500))}
                        className="h-8 text-sm"
                        min={1}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setMinPrice(0); setMaxPrice(500); }}
                      className="h-8 text-xs"
                    >
                      איפוס
                    </Button>
                  </div>
                </div>
              )}

              {/* Product Source Tabs (AD CENTER) */}
              <div className="flex gap-2 overflow-x-auto pb-1" dir="rtl">
                {PRODUCT_SOURCES.map((src) => (
                  <button
                    key={src.id}
                    onClick={() => handleSourceChange(src.id as ProductSource)}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap
                      transition-all duration-200 text-sm font-medium
                      ${productSource === src.id 
                        ? 'bg-primary text-primary-foreground shadow-lg scale-105' 
                        : 'bg-card/50 hover:bg-card border border-border/50 hover:border-primary/30'
                      }
                    `}
                  >
                    <span>{src.emoji}</span>
                    <span>{src.label}</span>
                  </button>
                ))}
              </div>

              {/* Categories Grid - only show for "hot" source */}
              {productSource === "hot" && (
                <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleCategoryChange(cat.id)}
                      className={`
                        flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl
                        transition-all duration-200 text-center min-h-[80px]
                        ${selectedCategory === cat.id 
                          ? 'bg-primary text-primary-foreground shadow-lg scale-105 ring-2 ring-primary/50' 
                          : 'bg-card/50 hover:bg-card border border-border/50 hover:border-primary/30 hover:scale-102'
                        }
                      `}
                    >
                      <span className="text-xl">{cat.emoji}</span>
                      <span className="text-[10px] md:text-xs font-medium leading-tight">
                        {cat.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Excel Import Mode */}
          <TabsContent value="excel" className="space-y-4 mt-4">
            <div className="glass-card neon-border p-4 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="h-5 w-5 text-success" />
                <h3 className="font-semibold text-foreground">ייבוא מקובץ Excel</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                העלה קובץ Excel עם מוצרים - התומך בכותרות גמישות (Title, Image, Price וכו')
              </p>
              <ExcelImporter 
                onProductsLoaded={handleExcelProductsLoaded} 
                onClearAll={handleClearAll}
                hasProducts={importedProducts.length > 0}
              />
            </div>

            {/* Channel Selection for Excel Import */}
            {messagingAccounts.length > 0 && (
              <div className="glass-card neon-border p-4 space-y-3" dir="rtl">
                <div className="flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" />
                  <h4 className="font-medium text-foreground text-sm">יעד שליחה</h4>
                  <span className="text-xs text-muted-foreground">
                    {excelTargetChannels.length === 0 ? "(כללי - כל הערוצים)" : `(${excelTargetChannels.length} נבחרו)`}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {messagingAccounts.map((acc) => {
                    const isSelected = excelTargetChannels.includes(acc.account_type);
                    return (
                      <button
                        key={acc.id}
                        onClick={() => {
                          setExcelTargetChannels(prev => {
                            // Toggle this account type
                            if (prev.includes(acc.account_type)) {
                              return prev.filter(c => c !== acc.account_type);
                            }
                            return [...new Set([...prev, acc.account_type])];
                          });
                        }}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                            : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                        )}
                      >
                        {acc.account_type === "telegram" ? "📨" : "💬"}
                        {acc.account_name}
                        {!acc.is_active && <span className="opacity-60">(לא פעיל)</span>}
                      </button>
                    );
                  })}
                  {excelTargetChannels.length > 0 && (
                    <button
                      onClick={() => setExcelTargetChannels([])}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      נקה (כללי)
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Zone Selector for Excel */}
            <ZoneSelector
              selectedZones={selectedZones}
              onSelectionChange={setSelectedZones}
              className="glass-card neon-border p-4"
            />

            {/* Imported Products Grid */}
            {importedProducts.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <span className="text-success">●</span>
                    מוצרים מיובאים ({importedProducts.length})
                  </h3>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-success/30 text-success">
                      שמורים מקומית
                    </Badge>
                  </div>
                </div>

                {/* Selection Controls */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedProductIds.size === importedProducts.length && importedProducts.length > 0}
                      onCheckedChange={toggleSelectAll}
                      id="select-all"
                    />
                    <label htmlFor="select-all" className="text-sm cursor-pointer">
                      {selectedProductIds.size === importedProducts.length ? 'בטל הכל' : 'בחר הכל'}
                    </label>
                    {selectedProductIds.size > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {selectedProductIds.size} נבחרו
                      </Badge>
                    )}
                  </div>
                  {selectedProductIds.size > 0 && (
                    <Button
                      onClick={handleAddSelectedToQueue}
                      disabled={isAddingSelected}
                      variant="gradient"
                      size="sm"
                      className="gap-2"
                    >
                      {isAddingSelected ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          מוסיף {selectedProductIds.size}...
                        </>
                      ) : (
                        <>
                          <ListPlus className="h-4 w-4" />
                          הוסף {selectedProductIds.size} לתור
                        </>
                      )}
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {importedProducts.map((product) => (
                    <div key={product.id} className="relative group">
                      {/* Selection Checkbox - Always Visible */}
                      <div 
                        className="absolute top-2 left-2 z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleProductSelection(product.id);
                        }}
                      >
                        <div 
                          className={`p-1.5 rounded-lg backdrop-blur-sm cursor-pointer transition-all shadow-md ${
                            selectedProductIds.has(product.id) 
                              ? 'bg-primary shadow-glow-sm scale-110' 
                              : 'bg-background/90 hover:bg-background border border-border hover:border-primary'
                          }`}
                        >
                          {selectedProductIds.has(product.id) ? (
                            <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
                          ) : (
                            <div className="h-5 w-5 border-2 border-muted-foreground/50 rounded-md" />
                          )}
                        </div>
                      </div>
                      <div className={`transition-all ${selectedProductIds.has(product.id) ? 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-xl' : ''}`}>
                        <ExcelProductCard
                          product={product}
                          onQuickAdd={() => handleQuickAddFromExcel(product)}
                          onEdit={() => handleEditFromExcel(product)}
                          isAdding={addingProductId === product.id}
                          onImageEnhanced={(productId, newImageUrl) => {
                            setImportedProducts(prev => prev.map(p => 
                              p.id === productId ? { ...p, imageUrl: newImageUrl } : p
                            ));
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Initial State - only for API/Scrape modes */}
        {activeMode !== "excel" && !hasFetched && !isLoading && !showManualInput && (
          <div className="glass-card neon-border p-12 text-center">
            <div className="relative inline-block">
              <Flame className="h-16 w-16 text-primary/50 mx-auto mb-4" />
              <div className="absolute inset-0 h-16 w-16 mx-auto bg-primary/20 blur-xl rounded-full" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">
              גלה את המוצרים הלוהטים ביותר
            </h3>
            <p className="text-muted-foreground mb-6">
              בחר קטגוריה או חפש מוצרים כדי לראות את 20 המוצרים הנמכרים ביותר
            </p>
            <Button onClick={() => fetchHotProducts()} variant="gradient" size="lg" className="animate-glow-pulse">
              <Flame className="h-5 w-5 mr-2" />
              טען מוצרים לוהטים
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
                  <div className="aspect-square bg-muted/30 rounded-lg mb-2 md:mb-3" />
                  <div className="h-3 md:h-4 bg-muted/30 rounded w-3/4 mb-2" />
                  <div className="h-3 md:h-4 bg-muted/30 rounded w-1/2" />
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
              <>
                {/* Zone Selector for API Products */}
                <ZoneSelector
                  selectedZones={selectedZones}
                  onSelectionChange={setSelectedZones}
                  className="p-3 rounded-lg bg-muted/30 border border-border/50"
                />

                {/* Selection Controls for API Products */}
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedApiProductIds.size === filteredProducts.length && filteredProducts.length > 0}
                      onCheckedChange={toggleSelectAllApi}
                      id="select-all-api"
                    />
                    <label htmlFor="select-all-api" className="text-sm cursor-pointer">
                      {selectedApiProductIds.size === filteredProducts.length ? 'בטל הכל' : 'בחר הכל'}
                    </label>
                    {selectedApiProductIds.size > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {selectedApiProductIds.size} נבחרו
                      </Badge>
                    )}
                  </div>
                  {selectedApiProductIds.size > 0 && (
                    <Button
                      onClick={handleAddSelectedApiToQueue}
                      disabled={isAddingSelected}
                      variant="gradient"
                      size="sm"
                      className="gap-2"
                    >
                      {isAddingSelected ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          מוסיף {selectedApiProductIds.size}...
                        </>
                      ) : (
                        <>
                          <ListPlus className="h-4 w-4" />
                          הוסף {selectedApiProductIds.size} לתור
                        </>
                      )}
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 md:gap-4">
                  {filteredProducts.map((product) => (
                    <div key={product.product_id} className={`relative glass-card neon-border overflow-hidden group card-interactive transition-all ${selectedApiProductIds.has(product.product_id) ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}>
                      {/* Selection Checkbox */}
                      <div 
                        className="absolute top-2 left-2 z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleApiProductSelection(product.product_id);
                        }}
                      >
                        <div 
                          className={`p-1.5 rounded-lg backdrop-blur-sm cursor-pointer transition-all shadow-md ${
                            selectedApiProductIds.has(product.product_id) 
                              ? 'bg-primary shadow-glow-sm scale-110' 
                              : 'bg-background/90 hover:bg-background border border-border hover:border-primary'
                          }`}
                        >
                          {selectedApiProductIds.has(product.product_id) ? (
                            <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
                          ) : (
                            <div className="h-5 w-5 border-2 border-muted-foreground/50 rounded-md" />
                          )}
                        </div>
                      </div>

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
                          <Badge className="absolute top-1 right-1 md:top-2 md:right-2 bg-destructive/90 text-[10px] md:text-xs px-1.5 md:px-2 shadow-glow-sm">
                            -{product.discount_percent}%
                          </Badge>
                        )}
                        {(product.sales_count || 0) > 100 && !product.discount_percent && (
                          <Badge className="absolute top-8 left-2 md:top-10 md:left-2 bg-destructive/90 text-[10px] md:text-xs px-1.5 md:px-2">
                            <Flame className="h-2.5 w-2.5 md:h-3 md:w-3 mr-0.5" />
                            חם
                          </Badge>
                        )}
                        {(product.rating || 0) > 4.5 && (
                          <Badge className="absolute bottom-1 right-1 md:bottom-2 md:right-2 bg-primary/90 text-[10px] md:text-xs px-1.5 md:px-2 shadow-glow-sm">
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
                          {/* Commission Rate Badge - Always visible when > 0 */}
                          {(product.commission_rate || 0) > 0 && (
                            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] md:text-xs font-medium ${
                              (product.commission_rate || 0) >= 8 
                                ? 'bg-success/30 text-success font-bold' 
                                : 'bg-success/20 text-success'
                            }`}>
                              <Percent className="h-2.5 w-2.5 md:h-3 md:w-3" />
                              {product.commission_rate?.toFixed(1)}%
                            </div>
                          )}
                        </div>
                        
                        {/* Stats row: Sales + Rating */}
                        <div className="flex items-center justify-between text-[10px] md:text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <ShoppingBag className="h-2.5 w-2.5 md:h-3 md:w-3" />
                            {(product.sales_count || 0).toLocaleString()} נמכרו
                          </div>
                          {(product.rating || 0) > 0 && (
                            <div className="flex items-center gap-1">
                              <Star className="h-2.5 w-2.5 md:h-3 md:w-3 text-warning" />
                              {(product.rating || 0).toFixed(1)}
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
                
                {/* Load More Button */}
                {hasMoreProducts && (
                  <div className="flex justify-center pt-6">
                    <Button
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      variant="outline"
                      size="lg"
                      className="gap-2 min-w-[200px]"
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          טוען עוד...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4" />
                          טען עוד מוצרים
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        </div>
      </PullToRefreshContainer>
    </MainLayout>
  );
};

export default Discovery;