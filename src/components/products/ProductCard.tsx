import { Product } from "@/types/product";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Send, Clock, MoreVertical, Edit, Trash } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: Product;
  onPostNow?: (product: Product) => void;
  onSchedule?: (product: Product) => void;
  onEdit?: (product: Product) => void;
  onDelete?: (product: Product) => void;
}

export const ProductCard = ({ product, onPostNow, onSchedule, onEdit, onDelete }: ProductCardProps) => {
  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'Scheduled': return 'scheduled';
      case 'Sent': return 'sent';
      case 'processing': return 'queued';
      default: return 'scheduled';
    }
  };

  return (
    <div className="glass-card neon-border overflow-hidden group hover:scale-[1.01] transition-all duration-300">
      <div className="flex flex-col sm:flex-row">
        {/* Product Image */}
        <div className="relative w-full sm:w-40 h-40 flex-shrink-0 overflow-hidden">
          {product.image_url ? (
            <img 
              src={product.image_url} 
              alt={product.title}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <span className="text-muted-foreground text-sm">No Image</span>
            </div>
          )}
          <div className="absolute top-2 left-2">
            <Badge variant={getStatusVariant(product.status)} className="capitalize">
              {product.status}
            </Badge>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-foreground line-clamp-2 flex-1">
              {product.title}
            </h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit?.(product)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onDelete?.(product)}
                  className="text-destructive"
                >
                  <Trash className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="font-mono text-primary font-semibold">
              ${product.price?.toFixed(2)}
            </span>
            <span>⭐ {product.rating}</span>
            <span>{product.orders_count?.toLocaleString()} orders</span>
          </div>

          {product.scheduled_time && (
            <div className="flex items-center gap-1.5 mt-2 text-sm text-primary">
              <Clock className="h-3.5 w-3.5" />
              <span>Scheduled: {new Date(product.scheduled_time).toLocaleString()}</span>
            </div>
          )}

          <div className="flex items-center gap-2 mt-auto pt-3">
            {product.channels.includes('telegram') && (
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                Telegram
              </Badge>
            )}
            {product.channels.includes('whatsapp') && (
              <Badge variant="outline" className="text-xs border-success/30 text-success">
                WhatsApp
              </Badge>
            )}
          </div>

          {product.status !== 'Sent' && (
            <div className="flex items-center gap-2 mt-3">
              <Button 
                size="sm" 
                variant="gradient"
                onClick={() => onPostNow?.(product)}
                className="flex-1"
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Post Now
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onSchedule?.(product)}
              >
                <Calendar className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
