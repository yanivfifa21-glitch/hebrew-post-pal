import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Loader2, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

export interface ExcelProduct {
  imageUrl: string;
  title: string;
  originalPrice: number;
  discountPrice: number;
  discountPercent: number;
  promotionLink: string;
  codeName?: string;
  codeValue?: string;
}

interface ExcelImporterProps {
  onProductsLoaded: (products: ExcelProduct[]) => void;
  isLoading?: boolean;
}

export const ExcelImporter = ({ onProductsLoaded, isLoading }: ExcelImporterProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseExcelFile = async (file: File) => {
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const products: ExcelProduct[] = jsonData.map((row: any) => ({
        imageUrl: row["Image Url"] || row["image_url"] || row["ImageUrl"] || "",
        title: row["Product Description"] || row["product_description"] || row["Title"] || row["title"] || "",
        originalPrice: parseFloat(row["Origin Price"] || row["origin_price"] || row["OriginalPrice"] || 0),
        discountPrice: parseFloat(row["Discount Price"] || row["discount_price"] || row["DiscountPrice"] || row["Price"] || 0),
        discountPercent: parseFloat(row["Discount"] || row["discount"] || row["Discount %"] || 0),
        promotionLink: row["Promotion Link"] || row["promotion_link"] || row["PromotionLink"] || row["Link"] || "",
        codeName: row["Code Name"] || row["code_name"] || row["CodeName"] || row["Coupon"] || "",
        codeValue: row["Code Value"] || row["code_value"] || row["CodeValue"] || row["Coupon Value"] || "",
      })).filter(p => p.title && (p.promotionLink || p.imageUrl));

      if (products.length === 0) {
        throw new Error("No valid products found in the Excel file");
      }

      setFileName(file.name);
      onProductsLoaded(products);
      toast({
        title: `✅ Loaded ${products.length} Products`,
        description: `Successfully imported from ${file.name}`,
      });
    } catch (error) {
      console.error("Excel parse error:", error);
      toast({
        title: "Import Failed",
        description: error instanceof Error ? error.message : "Could not parse Excel file",
        variant: "destructive",
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      parseExcelFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls"))) {
      parseExcelFile(file);
    } else {
      toast({
        title: "Invalid File",
        description: "Please upload an Excel file (.xlsx or .xls)",
        variant: "destructive",
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const clearFile = () => {
    setFileName(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        className="hidden"
        id="excel-upload"
      />
      
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer
          ${isDragging 
            ? "border-primary bg-primary/10" 
            : "border-border hover:border-primary/50 hover:bg-muted/30"
          }
        `}
        onClick={() => fileInputRef.current?.click()}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Processing...</p>
          </div>
        ) : fileName ? (
          <div className="flex items-center justify-center gap-3">
            <FileSpreadsheet className="h-6 w-6 text-green-500" />
            <span className="text-sm font-medium text-foreground">{fileName}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              גרור קובץ Excel או לחץ להעלאה
            </p>
            <p className="text-xs text-muted-foreground">
              .xlsx או .xls
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
