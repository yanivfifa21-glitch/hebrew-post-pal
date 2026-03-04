import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PackageOpen, Loader2 } from "lucide-react";

interface DBProduct {
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
}

export function ProductImportDialog({ onImport, maxProducts = 6 }: ProductImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<DBProduct[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelected(new Set());
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("products")
        .select("id, title, price, image_url, affiliate_link, hebrew_description")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        toast({ title: "שגיאה בטעינת מוצרים", variant: "destructive" });
      } else {
        setProducts(data || []);
      }
      setLoading(false);
    })();
  }, [open]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < maxProducts) {
        next.add(id);
      } else {
        toast({ title: `ניתן לבחור עד ${maxProducts} מוצרים` });
      }
      return next;
    });
  };

  const handleImport = () => {
    const items = products.filter(p => selected.has(p.id));
    onImport(items);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PackageOpen className="h-4 w-4 ml-1" />
          ייבא מפוסטים קיימים
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle>בחר מוצרים לקולאז׳ (עד {maxProducts})</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : products.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">אין מוצרים</p>
        ) : (
          <ScrollArea className="h-[400px] pr-2">
            <div className="space-y-2">
              {products.map(p => (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition-colors ${
                    selected.has(p.id) ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted/40"
                  }`}
                >
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={() => toggle(p.id)}
                  />
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt=""
                      className="w-12 h-12 rounded-md object-cover shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.title}</p>
                    {p.price != null && (
                      <p className="text-xs text-muted-foreground">${p.price}</p>
                    )}
                  </div>
                </label>
              ))}
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
