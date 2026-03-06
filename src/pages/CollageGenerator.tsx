import { useState, useRef, useCallback, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Upload, Download, Copy, Image as ImageIcon, Trash2, 
  Loader2, Eye, RefreshCw, Replace, Send, CheckSquare
} from "lucide-react";
import { 
  ProductImportDialog, 
  extractShortName, 
  extractPriceFromDesc, 
  extractCoupon, 
  extractLinkFromDesc,
  extractPostSummary,
  type DBProduct 
} from "@/components/collage/ProductImportDialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";

const USD_TO_ILS = 3.19;
const DEFAULT_TEMPLATE = "/collage-template.jpeg";

// 2x3 grid cells (2 rows, 3 columns) based on the reference image
// The reference image is ~1024x1024, header takes ~22%, footer ~15%
// Product area: y=225 to y=785, 3 columns, 2 rows
const GRID_CELLS = [
  { x: 17, y: 210, w: 322, h: 300 }, // row1-col1
  { x: 350, y: 210, w: 322, h: 300 }, // row1-col2
  { x: 683, y: 210, w: 322, h: 300 }, // row1-col3
  { x: 17, y: 555, w: 322, h: 295 }, // row2-col1
  { x: 350, y: 555, w: 322, h: 295 }, // row2-col2
  { x: 683, y: 555, w: 322, h: 295 }, // row2-col3
];

const PRODUCT_COUNT = 6;

interface ProductInput {
  image: File | null;
  imagePreview: string | null;
  name: string;
  summary: string;
  priceUsd: string;
  priceIls: string;
  coupon: string;
  link: string;
}

const emptyProduct = (): ProductInput => ({
  image: null, imagePreview: null, name: "", summary: "", priceUsd: "", priceIls: "", coupon: "", link: "",
});

function convertPrice(usd: string, ils: string): { usd: string; ils: string } {
  if (usd && !ils) return { usd, ils: (parseFloat(usd) * USD_TO_ILS).toFixed(0) };
  if (ils && !usd) return { usd: (parseFloat(ils) / USD_TO_ILS).toFixed(2), ils };
  return { usd, ils };
}

interface MessagingAccount {
  id: string;
  account_type: string;
  account_name: string;
  is_active: boolean;
  telegram_chat_id: string | null;
  whatsapp_chat_id: string | null;
}

const CollageGenerator = () => {
  const [templatePreview, setTemplatePreview] = useState<string>(DEFAULT_TEMPLATE);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [products, setProducts] = useState<ProductInput[]>(
    Array.from({ length: PRODUCT_COUNT }, emptyProduct)
  );
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Send dialog state
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [accounts, setAccounts] = useState<MessagingAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    const { data } = await supabase.rpc("get_my_messaging_accounts_safe");
    if (data) {
      setAccounts(data.filter((a: any) => a.is_active) as unknown as MessagingAccount[]);
    }
    setLoadingAccounts(false);
  }, []);

  useEffect(() => {
    if (sendDialogOpen) fetchAccounts();
  }, [sendDialogOpen, fetchAccounts]);

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTemplateFile(file);
    setTemplatePreview(URL.createObjectURL(file));
    setGeneratedImage(null);
  };

  const handleProductImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProducts(prev => {
      const next = [...prev];
      next[index] = { ...next[index], image: file, imagePreview: URL.createObjectURL(file) };
      return next;
    });
    setGeneratedImage(null);
  };

  const updateProduct = (index: number, field: keyof ProductInput, value: string) => {
    setProducts(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const clearProduct = (index: number) => {
    setProducts(prev => {
      const next = [...prev];
      next[index] = emptyProduct();
      return next;
    });
  };

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  const generateCollage = useCallback(async () => {
    setIsGenerating(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const templateSrc = templateFile 
        ? URL.createObjectURL(templateFile) 
        : DEFAULT_TEMPLATE;
      const templateImg = await loadImage(templateSrc);
      canvas.width = templateImg.width;
      canvas.height = templateImg.height;
      const scaleX = templateImg.width / 1024;
      const scaleY = templateImg.height / 1024;

      ctx.drawImage(templateImg, 0, 0);

      for (let i = 0; i < PRODUCT_COUNT; i++) {
        const product = products[i];
        if (!product.image) continue;
        const cell = GRID_CELLS[i];
        const sx = cell.x * scaleX, sy = cell.y * scaleY;
        const sw = cell.w * scaleX, sh = cell.h * scaleY;

        const img = await loadImage(URL.createObjectURL(product.image));
        const imgRatio = img.width / img.height;
        const cellRatio = sw / sh;
        let drawW: number, drawH: number, drawX: number, drawY: number;
        if (imgRatio > cellRatio) {
          drawH = sh; drawW = sh * imgRatio;
          drawX = sx - (drawW - sw) / 2; drawY = sy;
        } else {
          drawW = sw; drawH = sw / imgRatio;
          drawX = sx; drawY = sy - (drawH - sh) / 2;
        }

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(sx, sy, sw, sh, 8 * scaleX);
        ctx.clip();
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        ctx.restore();
      }

      setGeneratedImage(canvas.toDataURL("image/png"));
      toast({ title: "✅ הקולאז׳ נוצר בהצלחה!" });
    } catch (err) {
      toast({ title: "שגיאה ביצירת הקולאז׳", variant: "destructive" });
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  }, [templateFile, products]);

  const generatePostText = (): string => {
    const header = "🔥 המוצרים שהכי אהבתם השבוע! 🔥\n\n";
    const items = products
      .filter(p => p.name || p.summary)
      .map((p, i) => {
        const prices = convertPrice(p.priceUsd, p.priceIls);
        const parts: string[] = [];
        
        // Product name
        parts.push(`${i + 1}. ${p.name || "מוצר"}`);
        
        // Summary (2-3 sentences from the post)
        if (p.summary) {
          parts.push(p.summary);
        }
        
        // Price line
        const priceStr = prices.ils && prices.usd
          ? `💰 ${prices.ils}₪ / $${prices.usd}`
          : prices.ils ? `💰 ${prices.ils}₪` : prices.usd ? `💰 $${prices.usd}` : "";
        if (priceStr) parts.push(priceStr);
        
        // Coupon
        if (p.coupon) parts.push(`🏷️ קופון: ${p.coupon}`);
        
        // Link
        if (p.link) parts.push(`🔗 ${p.link}`);
        
        return parts.join("\n");
      })
      .join("\n\n");
    return header + items;
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(generatePostText());
    toast({ title: "✅ הטקסט הועתק!" });
  };

  const handleDownloadImage = () => {
    if (!generatedImage) return;
    const a = document.createElement("a");
    a.href = generatedImage;
    a.download = `collage-${Date.now()}.png`;
    a.click();
  };

  const handleImportProducts = async (dbProducts: DBProduct[]) => {
    const newProducts = [...products];
    for (let i = 0; i < dbProducts.length && i < PRODUCT_COUNT; i++) {
      const dp = dbProducts[i];
      
      const shortName = extractShortName(dp.hebrew_description, dp.title);
      const summary = extractPostSummary(dp.hebrew_description);
      const descPrices = extractPriceFromDesc(dp.hebrew_description);
      const coupon = extractCoupon(dp.hebrew_description);
      const descLink = extractLinkFromDesc(dp.hebrew_description);
      
      // Only use price if found in post - don't force recalculation
      const priceUsd = descPrices.usd || "";
      const priceIls = descPrices.ils || "";

      let imageFile: File | null = null;
      let imagePreview: string | null = null;
      if (dp.image_url) {
        try {
          const resp = await fetch(dp.image_url);
          const blob = await resp.blob();
          imageFile = new File([blob], `product-${i}.jpg`, { type: blob.type });
          imagePreview = URL.createObjectURL(imageFile);
        } catch {
          imagePreview = dp.image_url;
        }
      }

      newProducts[i] = {
        image: imageFile,
        imagePreview,
        name: shortName,
        summary,
        priceUsd,
        priceIls,
        coupon, // only if found in post
        link: dp.affiliate_link || descLink || "",
      };
    }
    setProducts(newProducts);
    setGeneratedImage(null);
    toast({ title: `✅ יובאו ${dbProducts.length} מוצרים` });
  };

  const toggleAccount = (id: string) => {
    setSelectedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSendCollage = async () => {
    if (!generatedImage || selectedAccounts.size === 0) return;
    setIsSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("לא מחובר");

      // Upload collage image to storage
      const blob = await (await fetch(generatedImage)).blob();
      const fileName = `collage-${Date.now()}.png`;
      const filePath = `${user.id}/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, blob, { contentType: "image/png" });
      
      if (uploadError) throw uploadError;
      
      const { data: urlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);
      
      const imageUrl = urlData.publicUrl;
      const postText = generatePostText();

      const selectedAccountsList = accounts.filter(a => selectedAccounts.has(a.id));

      const results = await Promise.allSettled(
        selectedAccountsList.map(async (account) => {
          const fnName = account.account_type === "telegram" ? "send-telegram" : "send-whatsapp";
          const { data, error } = await supabase.functions.invoke(fnName, {
            body: {
              title: "",
              hebrewDescription: postText,
              price: 0,
              imageUrl,
              affiliateLink: null,
              userId: user.id,
              accountId: account.id,
              mediaType: "image",
            },
          });
          if (error) {
            console.error(`[collage-send] Error sending to ${account.account_name}:`, error);
            throw error;
          }
          if (data && !data.success) {
            console.error(`[collage-send] API error for ${account.account_name}:`, data.error);
            throw new Error(data.error || "Unknown API error");
          }
          return account.account_name;
        })
      );

      const successCount = results.filter(r => r.status === "fulfilled").length;
      const failedResults = results.filter(r => r.status === "rejected") as PromiseRejectedResult[];
      
      if (failedResults.length > 0) {
        console.error("[collage-send] Failed sends:", failedResults.map(r => r.reason));
      }

      toast({ 
        title: successCount > 0 
          ? `✅ נשלח ל-${successCount}/${selectedAccountsList.length} חשבונות` 
          : "❌ השליחה נכשלה",
        description: failedResults.length > 0 ? `${failedResults.length} שליחות נכשלו` : undefined,
        variant: successCount === 0 ? "destructive" : undefined,
      });
      if (successCount > 0) {
        setSendDialogOpen(false);
        setSelectedAccounts(new Set());
      }
    } catch (err: any) {
      console.error("[collage-send] General error:", err);
      toast({ title: "שגיאה בשליחה", description: err.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const filledCount = products.filter(p => p.name || p.image).length;

  return (
    <MainLayout>
      <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4" dir="rtl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl md:text-2xl font-bold gradient-text">יוצר קולאז׳</h1>
          <div className="flex gap-2">
            <ProductImportDialog onImport={handleImportProducts} maxProducts={PRODUCT_COUNT} />
            <Button
              variant="gradient"
              size="sm"
              onClick={generateCollage}
              disabled={isGenerating}
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <RefreshCw className="h-4 w-4 ml-1" />}
              צור קולאז׳
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-4">
          {/* Left - Products */}
          <div className="space-y-3">
            {/* Template - compact with change option */}
            <div className="glass-card neon-border p-2 flex items-center gap-3">
              <img src={templatePreview} alt="Template" className="h-12 w-12 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">תבנית בסיס</p>
              </div>
              <input type="file" accept="image/*" onChange={handleTemplateUpload} className="hidden" id="template-upload" />
              <label htmlFor="template-upload" className="cursor-pointer">
                <Button variant="ghost" size="sm" className="h-7 text-xs pointer-events-none">
                  <Replace className="h-3 w-3 ml-1" />
                  החלף
                </Button>
              </label>
            </div>

            {/* 3x2 Product Grid */}
            <div className="grid grid-cols-3 gap-2">
              {products.map((product, index) => (
                <div key={index} className="glass-card neon-border p-2 space-y-1.5 relative group">
                  {(product.name || product.image) && (
                    <button
                      onClick={() => clearProduct(index)}
                      className="absolute top-1 left-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive/80 rounded-full p-0.5"
                    >
                      <Trash2 className="h-3 w-3 text-destructive-foreground" />
                    </button>
                  )}

                  {/* Image */}
                  <input type="file" accept="image/*" onChange={(e) => handleProductImageUpload(index, e)} className="hidden" id={`p-img-${index}`} />
                  <label htmlFor={`p-img-${index}`} className="block aspect-square rounded-lg overflow-hidden border border-border/30 cursor-pointer hover:border-primary/40 transition-colors">
                    {product.imagePreview ? (
                      <img src={product.imagePreview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-1">
                        <Upload className="h-4 w-4" />
                        <span className="text-[10px]">{index + 1}</span>
                      </div>
                    )}
                  </label>

                  {/* Name */}
                  <Input
                    placeholder="שם מוצר"
                    value={product.name}
                    onChange={(e) => updateProduct(index, "name", e.target.value)}
                    className="h-6 text-[11px] px-1.5"
                  />
                  {/* Summary */}
                  <Textarea
                    placeholder="תיאור קצר (2-3 משפטים)"
                    value={product.summary}
                    onChange={(e) => updateProduct(index, "summary", e.target.value)}
                    className="text-[10px] px-1.5 py-1 min-h-[36px] max-h-[60px] resize-none"
                    rows={2}
                  />
                  {/* Prices */}
                  <div className="grid grid-cols-2 gap-1">
                    <Input
                      placeholder="$"
                      value={product.priceUsd}
                      onChange={(e) => updateProduct(index, "priceUsd", e.target.value)}
                      className="h-6 text-[11px] px-1.5"
                    />
                    <Input
                      placeholder="₪"
                      value={product.priceIls}
                      onChange={(e) => updateProduct(index, "priceIls", e.target.value)}
                      className="h-6 text-[11px] px-1.5"
                    />
                  </div>
                  <Input
                    placeholder="🏷️ קופון"
                    value={product.coupon}
                    onChange={(e) => updateProduct(index, "coupon", e.target.value)}
                    className="h-6 text-[11px] px-1.5"
                  />
                  <Input
                    placeholder="קישור"
                    value={product.link}
                    onChange={(e) => updateProduct(index, "link", e.target.value)}
                    className="h-6 text-[11px] px-1.5"
                    dir="ltr"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Right - Preview & Text */}
          <div className="space-y-3">
            {/* Preview */}
            <div className="glass-card neon-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-primary" />
                  תצוגה מקדימה
                </Label>
                <div className="flex gap-1.5">
                  {generatedImage && (
                    <>
                      <Button variant="success" size="sm" onClick={handleDownloadImage} className="h-7 text-xs">
                        <Download className="h-3 w-3 ml-1" />
                        הורד
                      </Button>
                      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="gradient" size="sm" className="h-7 text-xs">
                            <Send className="h-3 w-3 ml-1" />
                            שלח
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-sm" dir="rtl">
                          <DialogHeader>
                            <DialogTitle>שלח קולאז׳ + טקסט</DialogTitle>
                          </DialogHeader>
                          {loadingAccounts ? (
                            <div className="flex justify-center py-6">
                              <Loader2 className="h-5 w-5 animate-spin text-primary" />
                            </div>
                          ) : accounts.length === 0 ? (
                            <p className="text-center text-muted-foreground py-6 text-sm">אין חשבונות פעילים</p>
                          ) : (
                            <div className="space-y-2">
                              {accounts.map(acc => (
                                <label
                                  key={acc.id}
                                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer border transition-colors ${
                                    selectedAccounts.has(acc.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                                  }`}
                                >
                                  <Checkbox
                                    checked={selectedAccounts.has(acc.id)}
                                    onCheckedChange={() => toggleAccount(acc.id)}
                                  />
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg">{acc.account_type === "telegram" ? "📱" : "💬"}</span>
                                    <span className="text-sm font-medium">{acc.account_name}</span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          )}
                          <Button
                            onClick={handleSendCollage}
                            disabled={isSending || selectedAccounts.size === 0}
                            className="w-full mt-2"
                          >
                            {isSending ? (
                              <Loader2 className="h-4 w-4 animate-spin ml-1" />
                            ) : (
                              <Send className="h-4 w-4 ml-1" />
                            )}
                            שלח ל-{selectedAccounts.size} חשבונות
                          </Button>
                        </DialogContent>
                      </Dialog>
                    </>
                  )}
                </div>
              </div>
              <div className="bg-muted/30 rounded-lg overflow-hidden flex items-center justify-center min-h-[200px]">
                {generatedImage ? (
                  <img src={generatedImage} alt="Collage" className="w-full rounded-lg" />
                ) : (
                  <div className="relative w-full">
                    <img src={templatePreview} alt="Template" className="w-full rounded-lg opacity-60" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded-md">
                        לחץ "צור קולאז׳"
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Post text */}
            <div className="glass-card neon-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">טקסט פוסט</Label>
                <Button variant="glass" size="sm" onClick={handleCopyText} disabled={filledCount === 0} className="h-7 text-xs">
                  <Copy className="h-3 w-3 ml-1" />
                  העתק
                </Button>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 min-h-[120px] max-h-[400px] overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed" dir="rtl">
                {filledCount > 0 ? generatePostText() : (
                  <span className="text-muted-foreground">הוסף מוצרים כדי לראות את הטקסט</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </MainLayout>
  );
};

export default CollageGenerator;
