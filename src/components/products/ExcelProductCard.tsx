import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit, ShoppingBag, Percent, Tag } from "lucide-react";
import { ExcelProduct } from "./ExcelImporter";

interface ExcelProductCardProps {
  product: ExcelProduct;
  onQuickAdd: (product: ExcelProduct) => void;
  onEdit: (product: ExcelProduct) => void;
  isAdding?: boolean;
}

export const ExcelProductCard = ({ product, onQuickAdd, onEdit, isAdding }: ExcelProductCardProps) => {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="glass-card neon-border overflow-hidden group card-interactive">
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-muted/20">
        {product.imageUrl && !imageError ? (
          <img
            src={product.imageUrl}
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
        
        {/* Discount Badge */}
        {product.discountPercent > 0 && (
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