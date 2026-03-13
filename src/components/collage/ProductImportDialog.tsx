import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PackageOpen, Loader2, Search } from "lucide-react";

export interface DBProduct {
  id: string;
  title: string;
  price: number | null;
  image_url: string | null;
  affiliate_link: string | null;
  hebrew_description: string | null;
}

interface ProductImportDialogProps {
  onImport: (products: DBProduct[]) => void;
  maxProducts?: number;
  selectedMap: Map<string, DBProduct>;
  onSelectedMapChange: (map: Map<string, DBProduct>) => void;
}

/** Extract a short product name from hebrew_description (first meaningful line) */
export function extractShortName(hebrewDesc: string | null, fallbackTitle: string): string {
  if (!hebrewDesc) return fallbackTitle;
  const lines = hebrewDesc.split("\n").map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.match(/^[\s💰🔥🎯✅⭐🛒📦💎🏷️🎉👇🔗⬇️➡️←→↓↑•\-–—\d$₪%.,!?]+$/u)) continue;
    if (line.match(/^https?:\/\//)) continue;
    if (line.match(/^קוד קופון|^קופון|^coupon/i)) continue;
    const cleaned = line
      .replace(/[💰🔥🎯✅⭐🛒📦💎🏷️🎉👇🔗⬇️➡️←→↓↑•]/gu, "")
      .replace(/[-–—]\s*[\$₪\d.\s/]+$/, "")
      .trim();
    if (cleaned.length > 2) return cleaned.slice(0, 60);
  }
  return fallbackTitle;
}

/** Extract 2-3 meaningful sentences from the post for the summary */
export function extractPostSummary(hebrewDesc: string | null): string {
  if (!hebrewDesc) return "";
  const lines = hebrewDesc.split("\n").map(l => l.trim()).filter(Boolean);
  const meaningful: string[] = [];
  
  for (const line of lines) {
    // Skip lines that are only emojis, prices, links, coupon codes, or very short
    if (line.match(/^https?:\/\//)) continue;
    if (line.match(/^[\s💰🔥🎯✅⭐🛒📦💎🏷️🎉👇🔗⬇️➡️←→↓↑•\-–—\d$₪%.,!?\s]+$/u)) continue;
    if (line.match(/^קוד קופון|^קופון|^coupon/i)) continue;
    // Skip pure price lines
    if (line.match(/^\$?\d+[\d.,]*\s*[\$₪]?\s*[/\\]?\s*\$?\d*[\d.,]*\s*[\$₪]?$/)) continue;
    
    const cleaned = line
      .replace(/[💰🔥🎯✅⭐🛒📦💎🏷️🎉👇🔗⬇️➡️←→↓↑•📍🚚✈️🎁💡⚡🆕🔝👆👉🤩😍💥🌟⭕❌📌🔴🟢🟡💸🛍️📢📣🤯😱🤤💪👀🥇🏆🎊🥳]/gu, "")
      .trim();
    
    if (cleaned.length > 5) {
      meaningful.push(cleaned);
    }
    if (meaningful.length >= 3) break;
  }
  
  // Skip the first one (it's the name), take next 2-3
  if (meaningful.length > 1) {
    return meaningful.slice(1, 4).join("\n");
  }
  return meaningful.join("\n");
}

/** Extract coupon code from hebrew description */
export function extractCoupon(hebrewDesc: string | null): string {
  if (!hebrewDesc) return "";
  const couponMatch = hebrewDesc.match(/(?:קוד\s*(?:קופון|הנחה)?|קופון)\s*[:\-–]?\s*([A-Za-z0-9]+)/);
  if (couponMatch) return couponMatch[1];
  return "";
}

/** Extract price from hebrew description */
export function extractPriceFromDesc(hebrewDesc: string | null): { usd: string; ils: string } {
  if (!hebrewDesc) return { usd: "", ils: "" };
  let usd = "", ils = "";
  const usdMatch = hebrewDesc.match(/\$\s*([\d.]+)/);
  const ilsMatch = hebrewDesc.match(/([\d.]+)\s*₪/) || hebrewDesc.match(/₪\s*([\d.]+)/);
  if (usdMatch) usd = usdMatch[1];
  if (ilsMatch) ils = ilsMatch[1];
  return { usd, ils };
}

/** Extract link from hebrew description */
export function extractLinkFromDesc(hebrewDesc: string | null): string {
  if (!hebrewDesc) return "";
  const match = hebrewDesc.match(/(https?:\/\/[^\s]+)/);
  return match ? match[1] : "";
}

export function ProductImportDialog({ onImport, maxProducts = 6, selectedMap, onSelectedMapChange }: ProductImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<DBProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const fetchProducts = async (query: string = "") => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    
    let q = supabase
      .from("products")
      .select("id, title, price, image_url, affiliate_link, hebrew_description")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (query.trim()) {
      q = q.or(`title.ilike.%${query.trim()}%,hebrew_description.ilike.%${query.trim()}%`);
    } else {
      q = q.limit(50);
    }

    const { data, error } = await q;
    if (error) {
      toast({ title: "שגיאה בטעינת מוצרים", variant: "destructive" });
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    setSearch("");
    fetchProducts();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (searchTimeout) clearTimeout(searchTimeout);
    const t = setTimeout(() => fetchProducts(search), 300);
    setSearchTimeout(t);
    return () => clearTimeout(t);
  }, [search]);

  const toggle = (id: string) => {
    const next = new Map(selectedMap);
    if (next.has(id)) {
      next.delete(id);
    } else if (next.size < maxProducts) {
      const product = products.find(p => p.id === id);
      if (product) next.set(id, product);
    } else {
      toast({ title: `ניתן לבחור עד ${maxProducts} מוצרים` });
    }
    onSelectedMapChange(next);
  };

  const handleImport = () => {
    const items = Array.from(selectedMap.values());
    onImport(items);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PackageOpen className="h-4 w-4 ml-1" />
          ייבא מפוסטים
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>בחר מוצרים לקולאז׳ (עד {maxProducts})</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="חפש לפי שם או תיאור..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : products.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">אין מוצרים</p>
        ) : (
          <ScrollArea className="h-[400px] pr-2">
            <div className="space-y-1">
              {products.map(p => {
                const shortName = extractShortName(p.hebrew_description, p.title);
                const coupon = extractCoupon(p.hebrew_description);
                return (
                  <label
                    key={p.id}
                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-colors ${
                      selectedMap.has(p.id) ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/40"
                    }`}
                  >
                    <Checkbox
                      checked={selectedMap.has(p.id)}
                      onCheckedChange={() => toggle(p.id)}
                    />
                    {p.image_url && (
                      <img
                        src={p.image_url}
                        alt=""
                        className="w-10 h-10 rounded-md object-cover shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{shortName}</p>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        {p.price != null && <span>${p.price}</span>}
                        {coupon && <span className="text-primary">🏷️ {coupon}</span>}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-between items-center pt-2">
          <span className="text-xs text-muted-foreground">{selected.size}/{maxProducts} נבחרו</span>
          <Button onClick={handleImport} disabled={selected.size === 0} size="sm">
            ייבא {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
