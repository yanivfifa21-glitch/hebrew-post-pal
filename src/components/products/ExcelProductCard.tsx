import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit, ShoppingBag, Percent } from "lucide-react";
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
    <div className="glass-card neon-border p-3 space-y-3 group hover:scale-[1.02] transition-transform">
      {/* Image */}
      <div className="relative aspect-square rounded-lg overflow-hidden bg-muted">
        {product.imageUrl && !imageError ? (
          <img
            src={product.imageUrl}
            alt={product.title}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}
        
        {/* Discount Badge */}
        {product.discountPercent > 0 && (
          <Badge 
            className="absolute top-2 right-2 bg-destructive text-destructive-foreground text-xs"
          >
            <Percent className="h-3 w-3 mr-0.5" />
            {Math.round(product.discountPercent)}%
          </Badge>
        )}

        {/* Coupon Badge */}
        {product.codeName && (
          <Badge 
            variant="outline"
            className="absolute bottom-2 left-2 bg-background/80 text-xs"
          >
            🎟️ {product.codeName}
          </Badge>
        )}
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-foreground line-clamp-2 min-h-[2.5rem]">
        {product.title}
      </h3>

      {/* Prices */}
      <div className="flex items-center gap-2">
        <span className="text-primary font-bold">${product.discountPrice.toFixed(2)}</span>
        {product.originalPrice > product.discountPrice && (
          <span className="text-muted-foreground text-sm line-through">
            ${product.originalPrice.toFixed(2)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="gradient"
          size="sm"
          className="flex-1 text-xs"
          onClick={() => onQuickAdd(product)}
          disabled={isAdding}
        >
          {isAdding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Quick Add
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => onEdit(product)}
        >
          <Edit className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
