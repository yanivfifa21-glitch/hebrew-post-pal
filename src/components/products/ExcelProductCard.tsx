import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit, ShoppingBag, Percent, Tag, Wand2, Sparkles } from "lucide-react";
import { ExcelProduct } from "./ExcelImporter";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ExcelProductCardProps {
  product: ExcelProduct;
  onQuickAdd: (product: ExcelProduct) => void;
  onEdit: (product: ExcelProduct) => void;
  isAdding?: boolean;
  onImageEnhanced?: (productId: string, newImageUrl: string) => void;
}

export const ExcelProductCard = ({ product, onQuickAdd, onEdit, isAdding, onImageEnhanced }: ExcelProductCardProps) => {
  const [imageError, setImageError] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedImageUrl, setEnhancedImageUrl] = useState<string | null>(null);

  const currentImageUrl = enhancedImageUrl || product.imageUrl;

  const handleEnhanceImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentImageUrl) return;

    setIsEnhancing(true);
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
      onImageEnhanced?.((product as any).id, data.imageUrl);
      
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
      setIsEnhancing(false);
    }
  };

  return (
    <div className="glass-card neon-border overflow-hidden group card-interactive">
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-muted/20">
        {currentImageUrl && !imageError ? (
          <img
            src={currentImageUrl}
            alt={product.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/30" />
          </div>
        )}
        
        {/* Enhanced Badge */}
        {enhancedImageUrl && (
          <div className="absolute top-2 left-2 bg-gradient-to-r from-primary to-secondary text-primary-foreground px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-0.5">
            <Sparkles className="h-2.5 w-2.5" />
            משודרגת
          </div>
        )}
        
        {/* Discount Badge */}
        {product.discountPercent > 0 && !enhancedImageUrl && (
          <Badge className="absolute top-2 left-2 bg-destructive/90 text-xs shadow-glow-sm">
            <Percent className="h-3 w-3 mr-0.5" />
            {Math.round(product.discountPercent)}%
          </Badge>
        )}

        {/* Coupon Badge */}
        {product.codeName && (
          <Badge className="absolute top-2 right-2 bg-success/90 text-xs shadow-glow-success">
            <Tag className="h-3 w-3 mr-0.5" />
            קופון
          </Badge>
        )}

        {/* Enhance Image Button */}
        <Button
          variant="glass"
          size="sm"
          className="absolute bottom-2 left-2 h-7 text-[10px] px-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleEnhanceImage}
          disabled={isEnhancing || !currentImageUrl}
        >
          {isEnhancing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Wand2 className="h-3 w-3 mr-0.5" />
              ✨ שדרג
            </>
          )}
        </Button>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        <h3 className="text-sm font-medium text-foreground line-clamp-2 min-h-[2.5rem]">
          {product.title}
        </h3>

        {/* Prices */}
        <div className="flex items-center gap-2">
          <span className="text-primary font-bold">${product.discountPrice.toFixed(2)}</span>
          {product.originalPrice > product.discountPrice && (
            <span className="text-muted-foreground text-xs line-through">
              ${product.originalPrice.toFixed(2)}
            </span>
          )}
        </div>

        {/* Coupon Info */}
        {product.codeName && (
          <div className="text-xs text-success flex items-center gap-1 bg-success/10 rounded-md px-2 py-1 border border-success/20">
            <Tag className="h-3 w-3" />
            <span className="truncate">{product.codeName}{product.codeValue ? `: ${product.codeValue}` : ""}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="gradient"
            size="sm"
            className="flex-1 text-xs h-8"
            onClick={() => onQuickAdd(product)}
            disabled={isAdding}
          >
            {isAdding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <Plus className="h-3.5 w-3.5 mr-1" />
                הוסף
              </>
            )}
          </Button>
          <Button
            variant="glass"
            size="sm"
            className="text-xs h-8 px-2"
            onClick={() => onEdit(product)}
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};