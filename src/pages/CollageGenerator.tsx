import { useState, useRef, useCallback, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { 
  Upload, Download, Copy, Image as ImageIcon, Trash2, 
  Loader2, Eye, RefreshCw 
} from "lucide-react";

const USD_TO_ILS = 3.19;

// Grid cell definitions relative to template (1024x1024 assumed)
// 3 columns x 2 rows grid based on the reference image
const GRID_CELLS = [
  { x: 30,  y: 145, w: 310, h: 310 }, // top-left
  { x: 355, y: 145, w: 310, h: 310 }, // top-center
  { x: 680, y: 145, w: 310, h: 310 }, // top-right
  { x: 30,  y: 475, w: 310, h: 310 }, // bottom-left
  { x: 355, y: 475, w: 310, h: 310 }, // bottom-center
  { x: 680, y: 475, w: 310, h: 310 }, // bottom-right
];

interface ProductInput {
  image: File | null;
  imagePreview: string | null;
  text: string;
  name: string;
  priceUsd: string;
  priceIls: string;
  link: string;
}

const emptyProduct = (): ProductInput => ({
  image: null,
  imagePreview: null,
  text: "",
  name: "",
  priceUsd: "",
  priceIls: "",
  link: "",
});

function parseProductText(text: string): Partial<ProductInput> {
  if (!text.trim()) return {};
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const result: Partial<ProductInput> = {};
  
  // Try to extract name (first non-price, non-link line)
  // Try to extract prices and link
  for (const line of lines) {
    const usdMatch = line.match(/\$\s*([\d.]+)/);
    const ilsMatch = line.match(/([\d.]+)\s*₪/) || line.match(/₪\s*([\d.]+)/);
    const linkMatch = line.match(/(https?:\/\/[^\s]+)/);
    
    if (usdMatch && !result.priceUsd) result.priceUsd = usdMatch[1];
    if (ilsMatch && !result.priceIls) result.priceIls = ilsMatch[1];
    if (linkMatch && !result.link) result.link = linkMatch[1];
  }
  
  // First line that isn't just a price or link is the name
  for (const line of lines) {
    if (!line.match(/^[\$₪\d.\s]+$/) && !line.match(/^https?:\/\//)) {
      result.name = line.replace(/[-–—]\s*[\$₪\d.\s/]+$/, "").trim();
      break;
    }
  }
  
  return result;
}

function convertPrice(usd: string, ils: string): { usd: string; ils: string } {
  if (usd && !ils) {
    return { usd, ils: (parseFloat(usd) * USD_TO_ILS).toFixed(0) };
  }
  if (ils && !usd) {
    return { usd: (parseFloat(ils) / USD_TO_ILS).toFixed(2), ils };
  }
  return { usd, ils };
}

const CollageGenerator = () => {
  const [templateImage, setTemplateImage] = useState<File | null>(null);
  const [templatePreview, setTemplatePreview] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductInput[]>(
    Array.from({ length: 6 }, emptyProduct)
  );
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTemplateImage(file);
    const url = URL.createObjectURL(file);
    setTemplatePreview(url);
    setGeneratedImage(null);
  };

  const handleProductImageUpload = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProducts(prev => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        image: file,
        imagePreview: URL.createObjectURL(file),
      };
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

  const handleTextParse = (index: number, text: string) => {
    updateProduct(index, "text", text);
    const parsed = parseProductText(text);
    if (parsed.name) updateProduct(index, "name", parsed.name);
    if (parsed.priceUsd) updateProduct(index, "priceUsd", parsed.priceUsd);
    if (parsed.priceIls) updateProduct(index, "priceIls", parsed.priceIls);
    if (parsed.link) updateProduct(index, "link", parsed.link);
  };

  const clearProduct = (index: number) => {
    setProducts(prev => {
      const next = [...prev];
      next[index] = emptyProduct();
      return next;
    });
  };

  const generateCollage = useCallback(async () => {
    if (!templateImage) {
      toast({ title: "חסרה תמונת תבנית", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Load template
      const templateImg = await loadImage(URL.createObjectURL(templateImage));
      canvas.width = templateImg.width;
      canvas.height = templateImg.height;

      // Scale grid cells based on actual template size
      const scaleX = templateImg.width / 1024;
      const scaleY = templateImg.height / 1024;

      ctx.drawImage(templateImg, 0, 0);

      // Overlay each product image
      for (let i = 0; i < 6; i++) {
        const product = products[i];
        if (!product.image) continue;

        const cell = GRID_CELLS[i];
        const sx = cell.x * scaleX;
        const sy = cell.y * scaleY;
        const sw = cell.w * scaleX;
        const sh = cell.h * scaleY;

        const img = await loadImage(URL.createObjectURL(product.image));
        
        // Calculate cover-fit dimensions
        const imgRatio = img.width / img.height;
        const cellRatio = sw / sh;
        let drawW, drawH, drawX, drawY;
        
        if (imgRatio > cellRatio) {
          drawH = sh;
          drawW = sh * imgRatio;
          drawX = sx - (drawW - sw) / 2;
          drawY = sy;
        } else {
          drawW = sw;
          drawH = sw / imgRatio;
          drawX = sx;
          drawY = sy - (drawH - sh) / 2;
        }

        // Clip to cell
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
  }, [templateImage, products]);

  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  };

  const generatePostText = (): string => {
    const header = "המוצרים שהכי אהבתם השבוע! 🔥\n\n";
    const items = products
      .filter(p => p.name)
      .map((p, i) => {
        const prices = convertPrice(p.priceUsd, p.priceIls);
        const priceStr = prices.ils && prices.usd
          ? `${prices.ils}₪ / $${prices.usd}`
          : prices.ils
            ? `${prices.ils}₪`
            : prices.usd
              ? `$${prices.usd}`
              : "";
        const linkStr = p.link ? `\n${p.link}` : "";
        return `${i + 1}. ${p.name}${priceStr ? ` - ${priceStr}` : ""}${linkStr}`;
      })
      .join("\n\n");
    return header + items;
  };

  const handleCopyText = () => {
    const text = generatePostText();
    navigator.clipboard.writeText(text);
    toast({ title: "✅ הטקסט הועתק!" });
  };

  const handleDownloadImage = () => {
    if (!generatedImage) return;
    const a = document.createElement("a");
    a.href = generatedImage;
    a.download = `collage-${Date.now()}.png`;
    a.click();
  };

  const filledCount = products.filter(p => p.name || p.image).length;

  return (
    <MainLayout>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold gradient-text">יוצר קולאז׳</h1>
            <p className="text-muted-foreground text-sm mt-1">
              צור קולאז׳ מוצרים מותאם אישית עם טקסט פוסט מוכן
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="gradient"
              onClick={generateCollage}
              disabled={!templateImage || isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin ml-1" />
              ) : (
                <RefreshCw className="h-4 w-4 ml-1" />
              )}
              צור קולאז׳
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Inputs */}
          <div className="space-y-4">
            {/* Template Upload */}
            <div className="glass-card neon-border p-4 space-y-3">
              <Label className="font-semibold text-base flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" />
                תמונת תבנית בסיס
              </Label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleTemplateUpload}
                  className="hidden"
                  id="template-upload"
                />
                <label
                  htmlFor="template-upload"
                  className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-primary/30 rounded-xl cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all"
                >
                  {templatePreview ? (
                    <img src={templatePreview} alt="Template" className="max-h-40 rounded-lg object-contain" />
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">העלה תמונת תבנית</span>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* Product Inputs */}
            <div className="space-y-3">
              {products.map((product, index) => (
                <div key={index} className="glass-card neon-border p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="font-semibold text-sm">מוצר {index + 1}</Label>
                    <Button variant="ghost" size="icon-sm" onClick={() => clearProduct(index)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-[100px_1fr] gap-3">
                    {/* Image upload */}
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleProductImageUpload(index, e)}
                        className="hidden"
                        id={`product-img-${index}`}
                      />
                      <label
                        htmlFor={`product-img-${index}`}
                        className="flex items-center justify-center w-[100px] h-[100px] border-2 border-dashed border-border/50 rounded-xl cursor-pointer hover:border-primary/40 transition-all overflow-hidden"
                      >
                        {product.imagePreview ? (
                          <img src={product.imagePreview} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Upload className="h-5 w-5 text-muted-foreground" />
                        )}
                      </label>
                    </div>

                    {/* Fields */}
                    <div className="space-y-2">
                      <Input
                        placeholder="שם המוצר"
                        value={product.name}
                        onChange={(e) => updateProduct(index, "name", e.target.value)}
                        className="h-8 text-xs"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="מחיר $ (USD)"
                          value={product.priceUsd}
                          onChange={(e) => updateProduct(index, "priceUsd", e.target.value)}
                          className="h-8 text-xs"
                        />
                        <Input
                          placeholder="מחיר ₪ (ILS)"
                          value={product.priceIls}
                          onChange={(e) => updateProduct(index, "priceIls", e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <Input
                        placeholder="קישור למוצר"
                        value={product.link}
                        onChange={(e) => updateProduct(index, "link", e.target.value)}
                        className="h-8 text-xs"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  {/* Quick parse textarea */}
                  <Textarea
                    placeholder="הדבק טקסט מוצר (שם, מחירים, קישור) - יפורסר אוטומטית..."
                    value={product.text}
                    onChange={(e) => handleTextParse(index, e.target.value)}
                    className="text-xs min-h-[50px] resize-none"
                    rows={2}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Right Column - Preview & Output */}
          <div className="space-y-4">
            {/* Image Preview */}
            <div className="glass-card neon-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-base flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  תצוגה מקדימה
                </Label>
                {generatedImage && (
                  <Button variant="success" size="sm" onClick={handleDownloadImage}>
                    <Download className="h-3.5 w-3.5 ml-1" />
                    הורד תמונה
                  </Button>
                )}
              </div>
              
              <div className="bg-muted/30 rounded-xl overflow-hidden flex items-center justify-center min-h-[300px]">
                {generatedImage ? (
                  <img src={generatedImage} alt="Generated collage" className="w-full rounded-lg" />
                ) : templatePreview ? (
                  <div className="relative w-full">
                    <img src={templatePreview} alt="Template preview" className="w-full rounded-lg opacity-60" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm text-muted-foreground bg-background/80 px-3 py-1.5 rounded-lg">
                        לחץ "צור קולאז׳" לאחר העלאת תמונות
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                    <ImageIcon className="h-12 w-12 opacity-30" />
                    <span className="text-sm">העלה תבנית כדי להתחיל</span>
                  </div>
                )}
              </div>
            </div>

            {/* Post Text Output */}
            <div className="glass-card neon-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-base">טקסט פוסט</Label>
                <Button variant="glass" size="sm" onClick={handleCopyText} disabled={filledCount === 0}>
                  <Copy className="h-3.5 w-3.5 ml-1" />
                  העתק
                </Button>
              </div>
              <div className="bg-muted/20 rounded-xl p-4 min-h-[150px] whitespace-pre-wrap text-sm leading-relaxed font-['Heebo']" dir="rtl">
                {filledCount > 0 ? generatePostText() : (
                  <span className="text-muted-foreground">הוסף מוצרים כדי לראות את הטקסט</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Hidden canvas for image generation */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </MainLayout>
  );
};

export default CollageGenerator;
