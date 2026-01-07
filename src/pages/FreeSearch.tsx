import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  Loader2,
  Plus,
  Star,
  ShoppingCart,
  Package,
  ImageOff,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface SearchProduct {
  product_id: string;
  title: string;
  price: number;
  original_price: number;
  image_url: string;
  sales_count: number;
  rating: number;
  product_url: string;
}

const FreeSearch = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [products, setProducts] = useState<SearchProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [isAddingToQueue, setIsAddingToQueue] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    const trimmedQuery = searchQuery.trim();
    
    if (!trimmedQuery) {
      toast({
        title: "נא להזין מילות חיפוש",
        variant: "destructive",
      });
      return;
    }

    // Clear previous results immediately
    setProducts([]);
    setIsSearching(true);
    setHasSearched(true);
    setSelectedProducts(new Set());

    console.log("[FreeSearch] Starting search for:", trimmedQuery);

    try {
      // DIRECT API call - no local filtering, await response fully
      const { data, error } = await supabase.functions.invoke("search-ali-products", {
        body: {
          keywords: trimmedQuery,
          pageSize: 40,
          sort: "BEST_MATCH", // Use BEST_MATCH for more relevant results
        },
      });

      console.log("[FreeSearch] API Response received:", data);

      if (error) {
        console.error("[FreeSearch] Supabase invoke error:", error);
        throw error;
      }

      if (!data.success) {
        console.error("[FreeSearch] API returned error:", data.error);
        throw new Error(data.error || "Search failed");
      }

      // Only set products AFTER we have the full response
      const receivedProducts = data.products || [];
      console.log("[FreeSearch] Products received:", receivedProducts.length);
      
      // Show translated keywords if applicable
      if (data.translatedKeywords) {
        console.log("[FreeSearch] Translated to:", data.translatedKeywords);
      }
      
      setProducts(receivedProducts);

      if (receivedProducts.length === 0) {
        toast({
          title: "לא נמצאו מוצרים",
          description: "נסה מילות חיפוש אחרות",
        });
      } else {
        const translatedMsg = data.translatedKeywords 
          ? `תורגם ל: "${data.translatedKeywords}"` 
          : "ממוין לפי מספר מכירות";
        toast({
          title: `נמצאו ${receivedProducts.length} מוצרים`,
          description: translatedMsg,
        });
      }
    } catch (error) {
      console.error("[FreeSearch] Search error:", error);
      toast({
        title: "שגיאה בחיפוש",
        description: error instanceof Error ? error.message : "אירעה שגיאה",
        variant: "destructive",
      });
      setProducts([]);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map(p => p.product_id)));
    }
  };

  const addSelectedToQueue = async () => {
    if (selectedProducts.size === 0) {
      toast({
        title: "לא נבחרו מוצרים",
        description: "בחר לפחות מוצר אחד להוספה למחסנית",
        variant: "destructive",
      });
      return;
    }

    setIsAddingToQueue(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const selectedProductsList = products.filter(p => selectedProducts.has(p.product_id));

      let successCount = 0;
      for (const product of selectedProductsList) {
        try {
          // 1. Generate affiliate link
          const { data: affResp, error: affErr } = await supabase.functions.invoke("generate-affiliate-link", {
            body: { productUrl: product.product_url, userId: user.id },
          });

          const affiliateLink = (!affErr && affResp?.success) ? affResp.affiliateLink : product.product_url;

          // 2. Generate Hebrew description with template
          const { data: hebResp, error: hebErr } = await supabase.functions.invoke("generate-hebrew-post", {
            body: { 
              title: product.title,
              ordersCount: product.sales_count || 0,
              rating: product.rating || 0,
              userId: user.id, // Pass userId to fetch custom prompt
            },
          });

          let hebrewDescription = "";
          if (!hebErr && hebResp?.success) {
            hebrewDescription = `${hebResp.hebrewDescription}\n\n👉 לרכישה: ${affiliateLink}`;
          } else {
            // Fallback template if generation fails
            hebrewDescription = `🔥 ${product.title}\n\n💰 מחיר: ${product.price.toFixed(2)}₪\n📦 ${(product.sales_count || 0).toLocaleString()} הזמנות\n⭐ ${(product.rating || 0).toFixed(1)} כוכבים\n\n👉 לרכישה: ${affiliateLink}`;
          }

          // Normalize rating to 0-5 scale
          let normalizedRating = product.rating ?? 0;
          if (normalizedRating > 5) {
            normalizedRating = normalizedRating / 20;
          }
          normalizedRating = Math.min(normalizedRating, 5);

          // 3. Insert to queue with template
          const { error: insertErr } = await supabase
            .from("products")
            .insert({
              user_id: user.id,
              title: product.title,
              original_url: product.product_url,
              image_url: product.image_url,
              price: product.price,
              orders_count: product.sales_count || 0,
              rating: normalizedRating,
              affiliate_link: affiliateLink,
              hebrew_description: hebrewDescription,
              status: "Scheduled",
              channels: [],
            });

          if (!insertErr) successCount++;
        } catch (productError) {
          console.error("Error adding product:", product.product_id, productError);
        }
      }

      if (successCount > 0) {
        toast({
          title: "נוספו למחסנית!",
          description: `${successCount} מוצרים נוספו בהצלחה עם תבנית`,
        });
        setSelectedProducts(new Set());
      } else {
        throw new Error("Failed to add any products");
      }
    } catch (error) {
      console.error("Add to queue error:", error);
      toast({
        title: "שגיאה בהוספה למחסנית",
        description: error instanceof Error ? error.message : "אירעה שגיאה",
        variant: "destructive",
      });
    } finally {
      setIsAddingToQueue(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
            <Search className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              <span className="gradient-text">חיפוש חופשי</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              חפש מוצרים באליאקספרס והוסף למחסנית
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  placeholder="הקלד מילות חיפוש באנגלית (לדוגמה: wireless earbuds)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-10 h-12 text-lg"
                  dir="ltr"
                />
              </div>
              <Button 
                onClick={handleSearch} 
                disabled={isSearching}
                size="lg"
                className="h-12 px-6"
              >
                {isSearching ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Search className="h-5 w-5 mr-2" />
                    חפש
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {products.length > 0 && (
          <>
            {/* Actions Bar */}
            <div className="flex items-center justify-between p-4 bg-card rounded-xl border">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAll}
                >
                  {selectedProducts.size === products.length ? "בטל בחירה" : "בחר הכל"}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedProducts.size} מתוך {products.length} נבחרו
                </span>
              </div>
              <Button
                onClick={addSelectedToQueue}
                disabled={selectedProducts.size === 0 || isAddingToQueue}
                className="gap-2"
              >
                {isAddingToQueue ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                הוסף למחסנית ({selectedProducts.size})
              </Button>
            </div>

            {/* Products Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
              {products.map((product) => {
                const isSelected = selectedProducts.has(product.product_id);
                const discount =
                  product.original_price > product.price
                    ? Math.round((1 - product.price / product.original_price) * 100)
                    : 0;

                return (
                  <Card
                    key={product.product_id}
                    className={`overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg ${
                      isSelected
                        ? "ring-2 ring-primary bg-primary/5"
                        : "hover:ring-1 hover:ring-primary/30"
                    }`}
                    onClick={() => toggleProductSelection(product.product_id)}
                  >
                    <div className="relative aspect-square bg-muted">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageOff className="h-12 w-12 text-muted-foreground/50" />
                        </div>
                      )}

                      {/* Selection Checkbox */}
                      <div className="absolute top-2 right-2">
                        <div
                          className={`p-1 rounded-lg ${
                            isSelected
                              ? "bg-primary"
                              : "bg-background/80 backdrop-blur-sm"
                          }`}
                        >
                          <Checkbox
                            checked={isSelected}
                            className={
                              isSelected
                                ? "border-primary-foreground data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                                : ""
                            }
                          />
                        </div>
                      </div>

                      {/* Discount Badge */}
                      {discount > 0 && (
                        <Badge className="absolute top-2 left-2 bg-destructive text-destructive-foreground">
                          -{discount}%
                        </Badge>
                      )}
                    </div>

                    <CardContent className="p-3 space-y-2">
                      <p
                        className="text-sm font-medium line-clamp-2 min-h-[40px]"
                        dir="ltr"
                      >
                        {product.title}
                      </p>

                      <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-bold text-primary">
                            ${product.price.toFixed(2)}
                          </span>
                          {product.original_price > product.price && (
                            <span className="text-xs text-muted-foreground line-through">
                              ${product.original_price.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                          <span>
                            {product.rating > 0 ? product.rating.toFixed(1) : "-"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <ShoppingCart className="h-3 w-3" />
                          <span>{product.sales_count.toLocaleString()}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {/* Empty State */}
        {hasSearched && products.length === 0 && !isSearching && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">לא נמצאו מוצרים</h3>
            <p className="text-muted-foreground max-w-sm">
              נסה מילות חיפוש אחרות או בדוק את האיות
            </p>
          </div>
        )}

        {/* Initial State */}
        {!hasSearched && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mb-6">
              <Sparkles className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-2">חפש מוצרים באליאקספרס</h3>
            <p className="text-muted-foreground max-w-md">
              הקלד מילות חיפוש באנגלית כדי למצוא מוצרים, בחר את המוצרים שאתה רוצה והוסף אותם למחסנית
            </p>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default FreeSearch;
