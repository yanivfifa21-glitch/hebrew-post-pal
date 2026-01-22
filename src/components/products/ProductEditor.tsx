import { useState, useEffect } from "react";
import { FetchedProductData, Product } from "@/types/product";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, Save, Send, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PostEmojiPicker } from "@/components/products/PostEmojiPicker";

export interface Coupon {
  code: string;
  amount: string;
}

interface ProductEditorProps {
  productData: FetchedProductData;
  originalUrl: string;
  onSaveToQueue: (product: Omit<Product, "id" | "created_at" | "updated_at">) => void;
  onPostNow: (product: Omit<Product, "id" | "created_at" | "updated_at">) => void;
  isLoading?: boolean;
  initialCoupons?: Coupon[];
}

export const ProductEditor = ({ productData, originalUrl, onSaveToQueue, onPostNow, isLoading, initialCoupons }: ProductEditorProps) => {
  const [title, setTitle] = useState(productData.title);
  const [price, setPrice] = useState(productData.price.toString());
  const [dollarPrice, setDollarPrice] = useState<string>("");
  const [usdExchangeRate, setUsdExchangeRate] = useState<number>(3.7);
  const [affiliateLink, setAffiliateLink] = useState(productData.affiliateLink || "");
  const [hebrewDescription, setHebrewDescription] = useState(productData.hebrewDescription || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons || [{ code: "", amount: "" }]);
  const [postEmoji, setPostEmoji] = useState<string>("🔥");
  const [isEnhancingImage, setIsEnhancingImage] = useState(false);
  const [enhancedImageUrl, setEnhancedImageUrl] = useState<string | null>(null);

  // Current image to display (enhanced or original)
  const currentImageUrl = enhancedImageUrl || productData.image_url;
  // Fetch USD exchange rate from settings
  useEffect(() => {
    const fetchExchangeRate = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from('app_settings')
        .select('usd_exchange_rate')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (data?.usd_exchange_rate) {
        setUsdExchangeRate(data.usd_exchange_rate);
      }
    };
    fetchExchangeRate();
  }, []);

  // Calculate ILS price when dollar price changes
  const ilsPrice = dollarPrice ? (parseFloat(dollarPrice) * usdExchangeRate).toFixed(0) : "";

  const addCoupon = () => {
    setCoupons([...coupons, { code: "", amount: "" }]);
  };

  const removeCoupon = (index: number) => {
    if (coupons.length > 1) {
      setCoupons(coupons.filter((_, i) => i !== index));
    }
  };

  const updateCoupon = (index: number, field: keyof Coupon, value: string) => {
    const updated = [...coupons];
    updated[index][field] = value;
    setCoupons(updated);
  };

  const buildCouponText = (): string => {
    // Filter coupons that have at least a code
    const couponsWithCode = coupons.filter(c => c.code.trim());
    if (couponsWithCode.length === 0) return "";
    
    // Case B: Multiple coupons
    if (couponsWithCode.length > 1) {
      const couponTexts = couponsWithCode.map(c => {
        if (c.amount.trim()) {
          return `🎟️ קופון *${c.code}* נותן הנחה של *${c.amount}* דולר`;
        }
        return `יש להזין קופון: *${c.code}*`;
      });
      return `🔥 *יש להזין קופון + קופון!*\n${couponTexts.join("\n")}`;
    }
    
    // Single coupon
    const coupon = couponsWithCode[0];
    // Case A: Code without value
    if (!coupon.amount.trim()) {
      return `🎟️ יש להזין קופון: *${coupon.code}*`;
    }
    // Code with value
    return `🎟️ קופון *${coupon.code}* נותן הנחה של *${coupon.amount}* דולר`;
  };

  // Build price text: "💰 רק $X כ-₪Y"
  const buildPriceText = (): string => {
    if (!dollarPrice || dollarPrice === "0" || !ilsPrice) return "";
    return `💰 רק *${dollarPrice}$* כ-*₪${ilsPrice}*`;
  };

  const handleGenerateHebrew = async () => {
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-hebrew-post", {
        body: { 
          title, 
          ordersCount: productData.orders_count,
          rating: productData.rating,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to generate Hebrew post");

      // Build final description with emoji prefix, price, coupons and link
      const priceText = buildPriceText();
      const couponText = buildCouponText();
      
      // Add emoji prefix if selected
      const emojiPrefix = postEmoji ? `${postEmoji} ` : "";
      const parts = [emojiPrefix + data.hebrewDescription];
      if (priceText) parts.push(priceText);
      if (couponText) parts.push(couponText);
      parts.push(`👉 לרכישה: ${affiliateLink}`);
      
      setHebrewDescription(parts.join("\n\n"));
      toast({
        title: "Content Generated!",
        description: "AI has created your Hebrew marketing post.",
      });
    } catch (e) {
      toast({
        title: "Generation Failed",
        description: e instanceof Error ? e.message : "Could not generate content.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle image enhancement
  const handleEnhanceImage = async () => {
    if (!currentImageUrl) {
      toast({
        title: "אין תמונה",
        description: "לא ניתן לשפר תמונה ללא מקור",
        variant: "destructive",
      });
      return;
    }

    setIsEnhancingImage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase.functions.invoke("enhance-product-image", {
        body: {
          imageUrl: currentImageUrl,
          userId: user.id,
        },
      });

      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Failed to enhance image");

      setEnhancedImageUrl(data.imageUrl);
      toast({
        title: "✨ התמונה שודרגה!",
        description: "התמונה הפכה למקצועית יותר",
      });
    } catch (e) {
      toast({
        title: "שיפור נכשל",
        description: e instanceof Error ? e.message : "לא הצלחנו לשפר את התמונה",
        variant: "destructive",
      });
    } finally {
      setIsEnhancingImage(false);
    }
  };

  const createProduct = (): Omit<Product, "id" | "created_at" | "updated_at"> => {
    // Normalize rating to 0-5 scale if needed (API might return 0-100)
    let normalizedRating = productData.rating ?? 0;
    if (normalizedRating > 5) {
      normalizedRating = normalizedRating / 20;
    }
    normalizedRating = Math.min(normalizedRating, 5);

    return {
      original_url: originalUrl,
      affiliate_link: affiliateLink || null,
      image_url: enhancedImageUrl || productData.image_url || null,
      title,
      hebrew_description: hebrewDescription || null,
      price: parseFloat(price),
      orders_count: productData.orders_count ?? 0,
      rating: normalizedRating,
      status: "Scheduled",
      scheduled_time: null,
      channels: [],
    };
  };

  return (
    <section className="glass-card neon-border p-6 space-y-6" aria-label="Product editor">
      <header className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Product Editor</h2>
          <p className="text-sm text-muted-foreground">Customize and generate marketing content</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="relative aspect-square rounded-xl overflow-hidden border border-border">
            <img src={currentImageUrl} alt={`${title} product image`} className="w-full h-full object-cover" loading="lazy" />
            
            {/* Enhanced badge */}
            {enhancedImageUrl && (
              <div className="absolute top-2 right-2 bg-gradient-to-r from-primary to-secondary text-primary-foreground px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                משודרגת
              </div>
            )}
            
            {/* Enhance button overlay */}
            <Button
              variant="glass"
              size="sm"
              className="absolute top-2 left-2 h-8 text-xs"
              onClick={handleEnhanceImage}
              disabled={isEnhancingImage}
            >
              {isEnhancingImage ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Wand2 className="h-3.5 w-3.5 mr-1" />
              )}
              {isEnhancingImage ? "משדרג..." : "✨ שדרג תמונה"}
            </Button>
            
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/90 to-transparent p-4">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="text-primary font-mono font-bold">${price}</span>
                {productData.rating > 0 && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">⭐ {productData.rating > 5 ? (productData.rating / 20).toFixed(1) : productData.rating.toFixed(1)}</span>
                  </>
                )}
                {productData.orders_count > 0 && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-muted-foreground">
                      {productData.orders_count > 500 ? "500+" : productData.orders_count.toLocaleString()} orders
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="title">Product Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5" />
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
                <Label htmlFor="dollarPrice">מחיר לפוסט ($)</Label>
                <Input
                  id="dollarPrice"
                  type="number"
                  step="0.01"
                  value={dollarPrice}
                  onChange={(e) => setDollarPrice(e.target.value)}
                  placeholder="אופציונלי"
                  className="mt-1.5"
                />
                {dollarPrice && ilsPrice && (
                  <p className="text-xs text-primary mt-1 font-medium" dir="rtl">
                    יופיע: 💰 רק {dollarPrice}$ כ-₪{ilsPrice}
                  </p>
                )}
              </div>
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

            {/* Coupons Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>קופונים</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addCoupon} className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  הוסף קופון
                </Button>
              </div>
              {coupons.map((coupon, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <Input
                    placeholder="קוד קופון"
                    value={coupon.code}
                    onChange={(e) => updateCoupon(index, "code", e.target.value)}
                    className="flex-1"
                    dir="ltr"
                  />
                  <Input
                    type="number"
                    placeholder="סכום ($)"
                    value={coupon.amount}
                    onChange={(e) => updateCoupon(index, "amount", e.target.value)}
                    className="w-24"
                    dir="ltr"
                  />
                  {coupons.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeCoupon(index)}
                      className="h-9 w-9 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {coupons.filter(c => c.code && c.amount).length > 1 && (
                <p className="text-xs text-primary font-medium">🔥 כפל קופונים יופיע בפוסט!</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="hebrew">Hebrew Marketing Post</Label>
            <div className="flex gap-2">
              <PostEmojiPicker 
                selectedEmoji={postEmoji}
                onSelect={setPostEmoji} 
              />
              <Button variant="outline" size="sm" onClick={handleGenerateHebrew} disabled={isGenerating}>
                {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Regenerate
              </Button>
            </div>
          </div>
          
          {/* Post Emoji Preview */}
          {postEmoji && (
            <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg border border-primary/20" dir="rtl">
              <span className="text-2xl">{postEmoji}</span>
              <span className="text-xs text-muted-foreground">יופיע בתחילת הפוסט (מונפש בטלגרם Premium)</span>
            </div>
          )}
          
          <Textarea
            id="hebrew"
            value={hebrewDescription}
            onChange={(e) => setHebrewDescription(e.target.value)}
            className="min-h-[280px] text-right font-medium"
            dir="rtl"
            placeholder="Hebrew marketing content..."
          />

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => onSaveToQueue(createProduct())} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save to Queue
            </Button>
            <Button variant="gradient" className="flex-1" onClick={() => onPostNow(createProduct())} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Post Now
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
