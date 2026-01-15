import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Loader2, X, Download, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

export interface ExcelProduct {
  // Columns accepted (strict): Image Url | Product Desc | Sales180Day | Positive Feedback | Promotion Url
  imageUrl: string;
  title: string; // mapped from "Product Desc"
  promotionLink: string; // mapped from "Promotion Url" (also used as affiliate link)
  affiliateLink?: string;
  hebrewDescription?: string;
  sales180Day?: number;
  positiveFeedback?: number;

  // Backwards-compat fields kept for UI that expects prices/discounts (Excel import will set them to 0)
  originalPrice: number;
  discountPrice: number;
  discountPercent: number;
  category?: string;
  codeName?: string;
  codeValue?: string;
}

interface ExcelImporterProps {
  onProductsLoaded: (products: ExcelProduct[]) => void;
  onClearAll?: () => void;
  hasProducts?: boolean;
  isLoading?: boolean;
}

// Normalize header: lowercase, remove spaces/special chars
const normalizeHeader = (header: string): string => {
  return String(header || "").toLowerCase().replace(/[\s_\-\.]/g, "");
};

// STRICT column matching - prioritize exact matches, then partial matches
// This prevents data jumping to wrong fields
const findColumn = (headers: string[], keywords: string[]): string | null => {
  const normalizedHeaders = headers.map(h => ({ original: h, normalized: normalizeHeader(h) }));
  
  // Priority 1: Exact match (normalized)
  for (const keyword of keywords) {
    const exactMatch = normalizedHeaders.find(h => h.normalized === keyword);
    if (exactMatch) return exactMatch.original;
  }
  
  // Priority 2: Starts with keyword (more reliable than includes)
  for (const keyword of keywords) {
    const startsMatch = normalizedHeaders.find(h => h.normalized.startsWith(keyword));
    if (startsMatch) return startsMatch.original;
  }
  
  // Priority 3: Contains keyword (last resort)
  for (const keyword of keywords) {
    const containsMatch = normalizedHeaders.find(h => h.normalized.includes(keyword));
    if (containsMatch) return containsMatch.original;
  }
  
  return null;
};

// Clean price: remove "USD", currency symbols, and non-numeric chars
const cleanPrice = (value: any): number => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  
  const cleaned = String(value)
    .replace(/USD/gi, "")
    .replace(/[^\d.,]/g, "")
    .replace(",", ".")
    .trim();
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

// Clean discount percentage
const cleanDiscount = (value: any): number => {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;
  
  const cleaned = String(value).replace(/[^\d.,]/g, "").replace(",", ".").trim();
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

export const ExcelImporter = ({ onProductsLoaded, onClearAll, hasProducts, isLoading }: ExcelImporterProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const templateData = [
      {
        "Image Url": "https://example.com/image.jpg",
        "Product Desc": "Baseus Eli Sport 2 Open-Ear Wireless Earphones...",
        "Sales180Day": "1200",
        "Positive Feedback": "96",
        "Promotion Url": "https://s.click.aliexpress.com/e/yourAffiliateLink"
      }
    ];
    
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "product_import_template.xlsx");
    
    toast({
      title: "Template Downloaded",
      description: "הטמפלט כולל רק את העמודות הנתמכות: Image Url, Product Desc, Sales180Day, Positive Feedback, Promotion Url",
    });
  };

  const parseExcelFile = async (file: File) => {
    const errors: string[] = [];
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        throw new Error("Excel file is empty");
      }

      // Get all headers from the first row
      const headers = Object.keys(jsonData[0] as object);
      console.log("Found headers:", headers);

      // Strict column mapping - ONLY the columns you provided
      const columnMap = {
        imageUrl: findColumn(headers, ["imageurl"]),
        title: findColumn(headers, ["productdesc"]),
        promotionLink: findColumn(headers, ["promotionurl"]),
        sales180Day: findColumn(headers, ["sales180day"]),
        positiveFeedback: findColumn(headers, ["positivefeedback"]),
      };

      console.log("Column mapping:", columnMap);

      // Required columns
      const missing: string[] = [];
      if (!columnMap.imageUrl) missing.push("Image Url");
      if (!columnMap.title) missing.push("Product Desc");
      if (!columnMap.promotionLink) missing.push("Promotion Url");

      if (missing.length > 0) {
        throw new Error(`Missing required columns: ${missing.join(", ")}. Found columns: ${headers.join(", ")}`);
      }

      const products: ExcelProduct[] = [];

      jsonData.forEach((row: any, index: number) => {
        const rowNum = index + 2; // Excel rows start at 1, plus header row
        
        const imageUrl = columnMap.imageUrl ? String(row[columnMap.imageUrl] || "").trim() : "";
        const title = columnMap.title ? String(row[columnMap.title] || "").trim() : "";
        const promotionLink = columnMap.promotionLink ? String(row[columnMap.promotionLink] || "").trim() : "";
        const sales180Day = columnMap.sales180Day ? cleanPrice(row[columnMap.sales180Day]) : 0;
        const positiveFeedback = columnMap.positiveFeedback ? cleanDiscount(row[columnMap.positiveFeedback]) : 0;

        // Validate row
        if (!title || !promotionLink) {
          errors.push(`Row ${rowNum}: Missing Product Desc or Promotion Url`);
          return;
        }

        products.push({
          imageUrl,
          title,
          promotionLink,
          affiliateLink: promotionLink, // IMPORTANT: keep the affiliate link from Excel
          hebrewDescription: undefined,
          sales180Day: sales180Day || undefined,
          positiveFeedback: positiveFeedback || undefined,

          // Backwards compat numeric fields
          originalPrice: 0,
          discountPrice: 0,
          discountPercent: 0,
          category: undefined,
          codeName: undefined,
          codeValue: undefined,
        });
      });

      setParseErrors(errors);

      if (products.length === 0) {
        throw new Error("No valid products found. Check that your Excel has Title or Image columns.");
      }

      setFileName(file.name);
      onProductsLoaded(products);
      
      toast({
        title: `✅ Loaded ${products.length} Products`,
        description: errors.length > 0 
          ? `${errors.length} rows skipped due to errors` 
          : `Successfully imported from ${file.name}`,
      });

      if (errors.length > 0) {
        console.warn("Import errors:", errors);
      }
    } catch (error) {
      console.error("Excel parse error:", error);
      setParseErrors([error instanceof Error ? error.message : "Unknown error"]);
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
    if (file && (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv"))) {
      parseExcelFile(file);
    } else {
      toast({
        title: "Invalid File",
        description: "Please upload an Excel file (.xlsx, .xls) or CSV",
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
    setParseErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileChange}
        className="hidden"
        id="excel-upload"
      />
      
      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={downloadTemplate}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Download Template
        </Button>
        
        {hasProducts && onClearAll && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClearAll}
            className="gap-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Clear All
          </Button>
        )}
      </div>
      
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
              .xlsx, .xls או .csv
            </p>
          </div>
        )}
      </div>

      {/* Error feedback */}
      {parseErrors.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm">
          <p className="font-medium text-destructive mb-1">Import Issues:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            {parseErrors.slice(0, 5).map((err, i) => (
              <li key={i}>{err}</li>
            ))}
            {parseErrors.length > 5 && (
              <li>...and {parseErrors.length - 5} more errors</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
