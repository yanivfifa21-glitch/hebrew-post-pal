import { useState, useRef, useCallback, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { 
  Upload, Download, Copy, Image as ImageIcon, Trash2, 
  Loader2, Eye, RefreshCw, Replace 
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

const USD_TO_ILS = 3.19;
const DEFAULT_TEMPLATE = "/collage-template.jpeg";

// 2x3 grid cells (2 rows, 3 columns) based on the reference image
// The reference image is ~1024x1024, header takes ~22%, footer ~15%
// Product area: y=225 to y=785, 3 columns, 2 rows
const GRID_CELLS = [
  { x: 17, y: 178, w: 322, h: 335 }, // row1-col1
  { x: 350, y: 178, w: 322, h: 335 }, // row1-col2
  { x: 683, y: 178, w: 322, h: 335 }, // row1-col3
  { x: 17, y: 527, w: 322, h: 335 }, // row2-col1
  { x: 350, y: 527, w: 322, h: 335 }, // row2-col2
  { x: 683, y: 527, w: 322, h: 335 }, // row2-col3
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

const CollageGenerator = () => {
  const [templatePreview, setTemplatePreview] = useState<string>(DEFAULT_TEMPLATE);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [products, setProducts] = useState<ProductInput[]>(
    Array.from({ length: PRODUCT_COUNT }, emptyProduct)
  );
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
      
      const priceUsd = descPrices.usd || (dp.price != null ? String(dp.price) : "");
      const priceIls = descPrices.ils || (dp.price != null ? (dp.price * USD_TO_ILS).toFixed(0) : "");

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
        coupon,
        link: dp.affiliate_link || descLink || "",
      };
    }
    setProducts(newProducts);
    setGeneratedImage(null);
    toast({ title: `✅ יובאו ${dbProducts.length} מוצרים` });
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
                {generatedImage && (
                  <Button variant="success" size="sm" onClick={handleDownloadImage} className="h-7 text-xs">
                    <Download className="h-3 w-3 ml-1" />
                    הורד
                  </Button>
                )}
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
