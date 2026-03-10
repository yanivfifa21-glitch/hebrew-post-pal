import { useState, useEffect, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ZoneSelector } from "@/components/products/ZoneSelector";
import { 
  Send, 
  Image as ImageIcon, 
  Video, 
  X, 
  Link,
  Loader2,
  MessageSquare,
  Plus,
  Layers,
  Trash2,
  Clock,
  Eye,
  AlertCircle,
  Sparkles,
  MapPin,
  Stamp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { TranslationModeSelector, TranslationMode } from "@/components/products/TranslationModeSelector";

interface MessagingAccount {
  id: string;
  account_type: string;
  account_name: string;
  is_active: boolean;
  telegram_chat_id: string | null;
  whatsapp_chat_id: string | null;
  has_bot_token: boolean;
  has_api_token: boolean;
  has_instance_id: boolean;
}

interface ManualQueueItem {
  id: string;
  message: string | null;
  media_url: string | null;
  media_type: string | null;
  status: string;
  created_at: string;
}

export default function ManualSend() {
  const [message, setMessage] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [imageUrlPreview, setImageUrlPreview] = useState<string | null>(null);
  const [loadingImageFromLink, setLoadingImageFromLink] = useState(false);
  const [allAccounts, setAllAccounts] = useState<MessagingAccount[]>([]);
  const [accounts, setAccounts] = useState<MessagingAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [manualQueue, setManualQueue] = useState<ManualQueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [sendingItemId, setSendingItemId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [translationMode, setTranslationMode] = useState<TranslationMode>("aiRewrite");
  const [isRewriting, setIsRewriting] = useState(false);
  const [isRewritingWithAffiliate, setIsRewritingWithAffiliate] = useState(false);
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [fetchedProductStats, setFetchedProductStats] = useState<{ orders_count?: number; rating?: number } | null>(null);
  const [addWatermark, setAddWatermark] = useState(false);
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [watermarkPreview, setWatermarkPreview] = useState<string | null>(null);
  const [watermarkedPreview, setWatermarkedPreview] = useState<string | null>(null);
  const watermarkCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isRewritingExternal, setIsRewritingExternal] = useState(false);
  const [externalRewriteVersion, setExternalRewriteVersion] = useState<Record<string, number>>({});

  // Load saved watermark from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("watermark_logo");
    if (saved) {
      setWatermarkPreview(saved);
      setAddWatermark(true);
    }
  }, []);

  const handleWatermarkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setWatermarkFile(file);
      setWatermarkPreview(dataUrl);
      localStorage.setItem("watermark_logo", dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const applyWatermark = async (file: File): Promise<File> => {
    if (!addWatermark || !watermarkPreview) return file;
    
    return new Promise((resolve, reject) => {
      const img = new Image();
      const logo = new Image();
      
      img.onload = () => {
        logo.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          
          // Logo size: 12% of image width, maintain aspect ratio
          const logoWidth = Math.round(img.width * 0.12);
          const logoHeight = Math.round(logoWidth * (logo.height / logo.width));
          const margin = Math.round(img.width * 0.02);
          
          // Bottom-right corner
          const x = img.width - logoWidth - margin;
          const y = img.height - logoHeight - margin;
          
          // Semi-transparent
          ctx.globalAlpha = 0.7;
          ctx.drawImage(logo, x, y, logoWidth, logoHeight);
          ctx.globalAlpha = 1.0;
          
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' }));
            } else {
              resolve(file);
            }
          }, 'image/png', 0.95);
        };
        logo.onerror = () => resolve(file);
        logo.src = watermarkPreview;
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  // Apply watermark to a URL image (for fetched images)
  const applyWatermarkToUrl = async (imageUrl: string): Promise<string> => {
    if (!addWatermark || !watermarkPreview) return imageUrl;
    
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const logo = new Image();
      
      img.onload = () => {
        logo.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
          
          const logoWidth = Math.round(img.width * 0.12);
          const logoHeight = Math.round(logoWidth * (logo.height / logo.width));
          const margin = Math.round(img.width * 0.02);
          const x = img.width - logoWidth - margin;
          const y = img.height - logoHeight - margin;
          
          ctx.globalAlpha = 0.7;
          ctx.drawImage(logo, x, y, logoWidth, logoHeight);
          ctx.globalAlpha = 1.0;
          
          resolve(canvas.toDataURL('image/png', 0.95));
        };
        logo.onerror = () => resolve(imageUrl);
        logo.src = watermarkPreview;
      };
      img.onerror = () => resolve(imageUrl);
      img.src = imageUrl;
    });
  };
  // Generate watermarked preview whenever media or watermark settings change
  useEffect(() => {
    const generateWatermarkedPreview = async () => {
      const sourcePreview = mediaPreview || imageUrlPreview || (mediaPreviews.length > 0 ? mediaPreviews[0] : null);
      if (!sourcePreview || !addWatermark || !watermarkPreview) {
        setWatermarkedPreview(null);
        return;
      }
      // Only for images
      if (mediaType === "video") {
        setWatermarkedPreview(null);
        return;
      }
      try {
        if (mediaFile) {
          // For uploaded files, apply watermark and create preview
          const watermarked = await applyWatermark(mediaFile);
          setWatermarkedPreview(URL.createObjectURL(watermarked));
        } else if (imageUrlPreview) {
          const result = await applyWatermarkToUrl(imageUrlPreview);
          setWatermarkedPreview(result);
        } else if (mediaPreviews.length > 0 && mediaFiles.length > 0) {
          const watermarked = await applyWatermark(mediaFiles[0]);
          setWatermarkedPreview(URL.createObjectURL(watermarked));
        }
      } catch {
        setWatermarkedPreview(null);
      }
    };
    generateWatermarkedPreview();
  }, [mediaPreview, imageUrlPreview, mediaPreviews, addWatermark, watermarkPreview, mediaFile, mediaType]);

  useEffect(() => {
    fetchAccounts();
    getCurrentUser();
  }, []);

  useEffect(() => {
    if (userId) {
      fetchManualQueue();
    }
  }, [userId]);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);
  };

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase.rpc("get_my_messaging_accounts_safe");
      if (error) throw error;
      
      // Store all accounts that have credentials configured
      const configuredAccounts = (data || []).filter((acc: MessagingAccount) => {
        if (acc.account_type === "telegram") {
          return acc.has_bot_token && acc.telegram_chat_id;
        }
        if (acc.account_type === "whatsapp") {
          return acc.has_api_token && acc.has_instance_id && acc.whatsapp_chat_id;
        }
        return false;
      });
      
      setAllAccounts(configuredAccounts);
      setAccounts(configuredAccounts);
      
      // Pre-select only active accounts by default
      const activeAccounts = configuredAccounts.filter((acc: MessagingAccount) => acc.is_active);
      setSelectedAccounts(activeAccounts.map((acc: MessagingAccount) => acc.id));
    } catch (error) {
      console.error("Error fetching accounts:", error);
      toast({ title: "שגיאה בטעינת הקבוצות", variant: "destructive" });
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchManualQueue = async () => {
    try {
      const { data, error } = await supabase
        .from("manual_queue")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      
      if (error) throw error;
      setManualQueue(data || []);
    } catch (error) {
      console.error("Error fetching manual queue:", error);
    } finally {
      setLoadingQueue(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("image/")) {
      setMediaType("image");
    } else if (file.type.startsWith("video/")) {
      setMediaType("video");
    } else {
      toast({
        title: "סוג קובץ לא נתמך",
        description: "ניתן להעלות רק תמונות או וידאו",
        variant: "destructive"
      });
      return;
    }

    const maxSize = file.type.startsWith("video/") ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "קובץ גדול מדי",
        description: file.type.startsWith("video/") ? "גודל מקסימלי לוידאו: 50MB" : "גודל מקסימלי לתמונה: 10MB",
        variant: "destructive"
      });
      return;
    }

    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
  };

  const handleMultiImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newFiles: File[] = [];
    const newPreviews: string[] = [];

    for (let i = 0; i < Math.min(files.length, 10 - mediaFiles.length); i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 10 * 1024 * 1024) continue;
      newFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    }

    if (newFiles.length === 0) {
      toast({ title: "לא נמצאו תמונות תקינות", variant: "destructive" });
      return;
    }

    setMediaFiles(prev => [...prev, ...newFiles]);
    setMediaPreviews(prev => [...prev, ...newPreviews]);
    setMediaType("image");
    // Clear single media
    setMediaFile(null);
    setMediaPreview(null);
    setImageUrlPreview(null);
  };

  const removeMultiImage = (idx: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== idx));
    setMediaPreviews(prev => prev.filter((_, i) => i !== idx));
    if (mediaFiles.length <= 1) setMediaType(null);
  };

  const clearMedia = () => {
    setMediaFile(null);
    setMediaFiles([]);
    setMediaPreviews([]);
    setMediaPreview(null);
    setMediaType(null);
    setImageUrlPreview(null);
    setWatermarkedPreview(null);
  };

  const clearForm = () => {
    setMessage("");
    clearMedia();
    setFetchedProductStats(null);
  };

  // Get the effective media URL and type (file upload takes priority, then image URL)
  const effectiveMediaPreview = mediaPreview || imageUrlPreview || (mediaPreviews.length > 0 ? mediaPreviews[0] : null);
  const displayMediaPreview = (addWatermark && watermarkedPreview) ? watermarkedPreview : effectiveMediaPreview;
  const effectiveMediaType = mediaType || (imageUrlPreview ? "image" : null);
  const hasMedia = !!mediaFile || !!imageUrlPreview || mediaFiles.length > 0;
  const isAlbumMode = mediaFiles.length > 1;

  // Detect AliExpress link in message text
  const detectAliLink = (text: string): string | null => {
    const match = text.match(/https?:\/\/(?:s\.click\.aliexpress\.com|a\.aliexpress\.com|www\.aliexpress\.com|aliexpress\.com)\S+/i);
    return match ? match[0] : null;
  };

  const detectedLink = detectAliLink(message);

  const handleFetchImageFromLink = async () => {
    if (!detectedLink) return;
    
    setLoadingImageFromLink(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-ali-product", {
        body: { productUrl: detectedLink },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to fetch product");

      if (data.data?.image_url) {
        setImageUrlPreview(data.data.image_url);
        setMediaFile(null);
        setMediaPreview(null);
        setMediaType(null);
        toast({ title: "✅ התמונה נטענה מהקישור" });
      } else {
        toast({ title: "לא נמצאה תמונה למוצר", variant: "destructive" });
      }
    } catch (e) {
      toast({
        title: "שגיאה בטעינת תמונה",
        description: e instanceof Error ? e.message : "נסה שוב",
        variant: "destructive",
      });
    } finally {
      setLoadingImageFromLink(false);
    }
  };

  const toggleAccount = (accountId: string) => {
    setSelectedAccounts(prev => 
      prev.includes(accountId) 
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const selectAll = () => setSelectedAccounts(allAccounts.map(acc => acc.id));
  const deselectAll = () => setSelectedAccounts([]);
  const selectActiveOnly = () => setSelectedAccounts(allAccounts.filter(acc => acc.is_active).map(acc => acc.id));

  const uploadMediaToStorage = async (file: File): Promise<string | null> => {
    try {
      // Apply watermark if enabled and file is an image
      let fileToUpload = file;
      if (file.type.startsWith("image/")) {
        fileToUpload = await applyWatermark(file);
      }
      
      const fileExt = fileToUpload.name.split('.').pop();
      const fileName = `manual-send/${userId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(fileName, fileToUpload, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error("Error uploading media:", error);
      return null;
    }
  };

  const sendToAccounts = async (
    msgText: string, 
    mediaUrl: string | null,
    targetAccounts: string[] = selectedAccounts,
    albumUrls: string[] = []
  ): Promise<{ success: number; failed: number }> => {
    const results = { success: 0, failed: 0 };

    const sendPromises = targetAccounts.map(async (accountId) => {
      const account = allAccounts.find(acc => acc.id === accountId);
      if (!account) return { success: false, accountName: "unknown" };

      try {
        const endpoint = account.account_type === "telegram" ? "send-telegram" : "send-whatsapp";

        console.log(`[ManualSend] Sending to ${account.account_name} via ${endpoint}`);

        const body: any = {
          title: "",
          hebrewDescription: msgText,
          price: 0,
          imageUrl: mediaUrl,
          affiliateLink: null,
          userId,
          accountId,
        };

        // Pass album URLs for multi-image support
        if (albumUrls.length > 1) {
          body.albumUrls = albumUrls;
        }

        const { data, error } = await supabase.functions.invoke(endpoint, { body });

        if (error) {
          console.error(`[ManualSend] Edge function error for ${account.account_name}:`, error);
          return { success: false, accountName: account.account_name, error: error.message };
        }

        if (!data?.success) {
          console.error(`[ManualSend] API error for ${account.account_name}:`, data?.error);
          return { success: false, accountName: account.account_name, error: data?.error };
        }

        console.log(`[ManualSend] Success for ${account.account_name}`);
        return { success: true, accountName: account.account_name };
      } catch (err) {
        console.error(`[ManualSend] Exception for ${account.account_name}:`, err);
        return { success: false, accountName: account.account_name, error: String(err) };
      }
    });

    const settledResults = await Promise.allSettled(sendPromises);
    
    for (const result of settledResults) {
      if (result.status === "fulfilled" && result.value.success) {
        results.success++;
      } else {
        results.failed++;
      }
    }

    return results;
  };

  // Resolve media URL: upload file or use image URL directly
  const resolveMediaUrl = async (): Promise<string | null> => {
    if (mediaFile) {
      const url = await uploadMediaToStorage(mediaFile);
      if (!url) throw new Error("Failed to upload media");
      return url;
    }
    if (imageUrlPreview) {
      // Apply watermark to URL-based images
      if (addWatermark && watermarkPreview) {
        try {
          const watermarkedDataUrl = await applyWatermarkToUrl(imageUrlPreview);
          if (watermarkedDataUrl.startsWith("data:")) {
            // Convert data URL to blob and upload
            const res = await fetch(watermarkedDataUrl);
            const blob = await res.blob();
            const file = new File([blob], `watermarked-${Date.now()}.png`, { type: "image/png" });
            const url = await uploadMediaToStorage(file);
            return url || imageUrlPreview;
          }
        } catch (e) {
          console.warn("Watermark failed for URL image, using original:", e);
        }
      }
      return imageUrlPreview;
    }
    if (mediaFiles.length > 0) {
      const url = await uploadMediaToStorage(mediaFiles[0]);
      if (!url) throw new Error("Failed to upload media");
      return url;
    }
    return null;
  };

  // Upload all album images
  const resolveAlbumUrls = async (): Promise<string[]> => {
    if (mediaFiles.length <= 1) return [];
    const urls: string[] = [];
    for (const file of mediaFiles) {
      const url = await uploadMediaToStorage(file);
      if (url) urls.push(url);
    }
    return urls;
  };

  // Action: Send Now
  const handleSendNow = async () => {
    if (!message.trim() && !hasMedia) {
      toast({ title: "נא להזין הודעה או להעלות מדיה", variant: "destructive" });
      return;
    }
    if (selectedAccounts.length === 0) {
      toast({ title: "נא לבחור לפחות קבוצה אחת", variant: "destructive" });
      return;
    }
    if (!userId) {
      toast({ title: "לא מחובר", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const mediaUrl = await resolveMediaUrl();
      const albumUrls = await resolveAlbumUrls();
      const results = await sendToAccounts(message, mediaUrl, selectedAccounts, albumUrls);

      if (results.success > 0) {
        toast({
          title: `נשלח בהצלחה ל-${results.success} קבוצות`,
          description: results.failed > 0 ? `${results.failed} שליחות נכשלו` : undefined
        });
        clearForm();
      } else {
        toast({ title: "כל השליחות נכשלו", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error sending:", error);
      toast({ title: "שגיאה בשליחה", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Action: Add to Manual Queue
  const handleAddToManualQueue = async () => {
    if (!message.trim() && !hasMedia) {
      toast({ title: "נא להזין הודעה או להעלות מדיה", variant: "destructive" });
      return;
    }
    if (!userId) {
      toast({ title: "לא מחובר", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const mediaUrl = await resolveMediaUrl();

      const { error } = await supabase.from("manual_queue").insert({
        user_id: userId,
        message: message.trim() || null,
        media_url: mediaUrl,
        media_type: effectiveMediaType
      });

      if (error) throw error;

      toast({ title: "נוסף למחסנית הידנית" });
      clearForm();
      fetchManualQueue();
    } catch (error) {
      console.error("Error adding to manual queue:", error);
      toast({ title: "שגיאה בהוספה למחסנית", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Action: Add to Both Queues
  const handleAddToBoth = async () => {
    if (!message.trim() && !hasMedia) {
      toast({ title: "נא להזין הודעה או להעלות מדיה", variant: "destructive" });
      return;
    }
    if (!userId) {
      toast({ title: "לא מחובר", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const mediaUrl = await resolveMediaUrl();

      // Add to manual queue
      const { error: manualError } = await supabase.from("manual_queue").insert({
        user_id: userId,
        message: message.trim() || null,
        media_url: mediaUrl,
        media_type: effectiveMediaType
      });

      if (manualError) throw manualError;

      // Add to products (automatic queue) with video support
      const { data: productData, error: productError } = await supabase.from("products").insert({
        user_id: userId,
        original_url: "manual-entry",
        title: message.trim().substring(0, 100) || "פוסט ידני",
        hebrew_description: message.trim() || null,
        image_url: mediaUrl,
        media_type: effectiveMediaType || "image",
        status: "Scheduled",
        sent_via: "manual",
        ...(fetchedProductStats?.orders_count ? { orders_count: fetchedProductStats.orders_count } : {}),
        ...(fetchedProductStats?.rating ? { rating: fetchedProductStats.rating } : {}),
      }).select("id").single();

      if (productError) throw productError;

      // Assign to zones if selected
      if (selectedZones.length > 0 && productData) {
        const zoneInserts = selectedZones.map(zoneId => ({
          zone_id: zoneId,
          product_id: productData.id,
          status: "Scheduled",
        }));
        await supabase.from("zone_products").insert(zoneInserts);
      }

      toast({ title: "נוסף לשתי המחסניות" });
      clearForm();
      fetchManualQueue();
    } catch (error) {
      console.error("Error adding to both queues:", error);
      toast({ title: "שגיאה בהוספה", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Action: Add to Automation Queue Only (products table)
  const handleAddToAutomationOnly = async () => {
    if (!message.trim() && !hasMedia) {
      toast({ title: "נא להזין הודעה או להעלות מדיה", variant: "destructive" });
      return;
    }
    if (!userId) {
      toast({ title: "לא מחובר", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const mediaUrl = await resolveMediaUrl();

      const { data: productData, error: productError } = await supabase.from("products").insert({
        user_id: userId,
        original_url: "manual-entry",
        title: message.trim().substring(0, 100) || "פוסט ידני",
        hebrew_description: message.trim() || null,
        image_url: mediaUrl,
        media_type: effectiveMediaType || "image",
        status: "Scheduled",
        sent_via: "manual",
        ...(fetchedProductStats?.orders_count ? { orders_count: fetchedProductStats.orders_count } : {}),
        ...(fetchedProductStats?.rating ? { rating: fetchedProductStats.rating } : {}),
      }).select("id").single();

      if (productError) throw productError;

      // Assign to zones if selected
      if (selectedZones.length > 0 && productData) {
        const zoneInserts = selectedZones.map(zoneId => ({
          zone_id: zoneId,
          product_id: productData.id,
          status: "Scheduled",
        }));
        await supabase.from("zone_products").insert(zoneInserts);
      }

      toast({ title: selectedZones.length > 0 
        ? `נוסף למחסנית האוטומטית ול-${selectedZones.length} אזורים` 
        : "נוסף למחסנית האוטומטית" 
      });
      clearForm();
    } catch (error) {
      console.error("Error adding to automation queue:", error);
      toast({ title: "שגיאה בהוספה", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Action: Send Now + Add to Automation Queue
  const handleSendAndAddToAutomation = async () => {
    if (!message.trim() && !hasMedia) {
      toast({ title: "נא להזין הודעה או להעלות מדיה", variant: "destructive" });
      return;
    }
    if (selectedAccounts.length === 0) {
      toast({ title: "נא לבחור לפחות קבוצה אחת", variant: "destructive" });
      return;
    }
    if (!userId) {
      toast({ title: "לא מחובר", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const mediaUrl = await resolveMediaUrl();
      const albumUrls = await resolveAlbumUrls();

      // 1. Send immediately to selected accounts
      const results = await sendToAccounts(message, mediaUrl, selectedAccounts, albumUrls);

      // 2. Add to automation queue (products table)
      const { data: productData, error: productError } = await supabase.from("products").insert({
        user_id: userId,
        original_url: "manual-entry",
        title: message.trim().substring(0, 100) || "פוסט ידני",
        hebrew_description: message.trim() || null,
        image_url: mediaUrl,
        media_type: effectiveMediaType || "image",
        status: "Scheduled",
        sent_via: "manual",
        ...(fetchedProductStats?.orders_count ? { orders_count: fetchedProductStats.orders_count } : {}),
        ...(fetchedProductStats?.rating ? { rating: fetchedProductStats.rating } : {}),
      }).select("id").single();

      if (productError) throw productError;

      // Assign to zones if selected
      if (selectedZones.length > 0 && productData) {
        const zoneInserts = selectedZones.map(zoneId => ({
          zone_id: zoneId,
          product_id: productData.id,
          status: "Scheduled",
        }));
        await supabase.from("zone_products").insert(zoneInserts);
      }

      if (results.success > 0) {
        toast({
          title: `נשלח ל-${results.success} קבוצות + נוסף לאוטומט`,
          description: results.failed > 0 ? `${results.failed} שליחות נכשלו` : undefined
        });
        clearForm();
      } else {
        toast({ title: "השליחה נכשלה, אך הפוסט נוסף לאוטומט", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error in send+automation:", error);
      toast({ title: "שגיאה", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Action: Add to Zone Only (zone_products only, no general queue)
  const handleAddToZoneOnly = async () => {
    if (!message.trim() && !hasMedia) {
      toast({ title: "נא להזין הודעה או להעלות מדיה", variant: "destructive" });
      return;
    }
    if (!userId) {
      toast({ title: "לא מחובר", variant: "destructive" });
      return;
    }
    if (selectedZones.length === 0) {
      toast({ title: "נא לבחור לפחות אזור אחד", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const mediaUrl = await resolveMediaUrl();

      const { data: productData, error: productError } = await supabase.from("products").insert({
        user_id: userId,
        original_url: "manual-entry",
        title: message.trim().substring(0, 100) || "פוסט ידני",
        hebrew_description: message.trim() || null,
        image_url: mediaUrl,
        media_type: effectiveMediaType || "image",
        status: "Scheduled",
        sent_via: "manual",
        ...(fetchedProductStats?.orders_count ? { orders_count: fetchedProductStats.orders_count } : {}),
        ...(fetchedProductStats?.rating ? { rating: fetchedProductStats.rating } : {}),
      }).select("id").single();

      if (productError) throw productError;

      const zoneInserts = selectedZones.map(zoneId => ({
        zone_id: zoneId,
        product_id: productData.id,
        status: "Scheduled",
      }));
      await supabase.from("zone_products").insert(zoneInserts);

      toast({ title: `✅ נוסף ל-${selectedZones.length} אזורים בלבד` });
      clearForm();
    } catch (error) {
      console.error("Error adding to zone:", error);
      toast({ title: "שגיאה בהוספה", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSendQueueItem = async (item: ManualQueueItem) => {
    if (selectedAccounts.length === 0) {
      toast({ title: "נא לבחור לפחות קבוצה אחת", variant: "destructive" });
      return;
    }

    setSendingItemId(item.id);
    try {
      const results = await sendToAccounts(item.message || "", item.media_url);

      if (results.success > 0) {
        // Mark as sent
        await supabase
          .from("manual_queue")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", item.id);

        toast({
          title: `נשלח בהצלחה ל-${results.success} קבוצות`,
          description: results.failed > 0 ? `${results.failed} שליחות נכשלו` : undefined
        });
        fetchManualQueue();
      } else {
        toast({ title: "כל השליחות נכשלו", variant: "destructive" });
      }
    } catch (error) {
      console.error("Error sending queue item:", error);
      toast({ title: "שגיאה בשליחה", variant: "destructive" });
    } finally {
      setSendingItemId(null);
    }
  };

  // Delete item from manual queue
  const handleDeleteQueueItem = async (id: string) => {
    try {
      const { error } = await supabase.from("manual_queue").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "נמחק מהמחסנית" });
      fetchManualQueue();
    } catch (error) {
      console.error("Error deleting queue item:", error);
      toast({ title: "שגיאה במחיקה", variant: "destructive" });
    }
  };

  const telegramAccounts = allAccounts.filter(acc => acc.account_type === "telegram");
  const whatsappAccounts = allAccounts.filter(acc => acc.account_type === "whatsapp");

  // AI Rewrite handler for manual send
  const handleAiRewrite = async () => {
    if (!message.trim()) {
      toast({ title: "נא להזין טקסט לכתיבה מחדש", variant: "destructive" });
      return;
    }

    setIsRewriting(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-hebrew-post", {
        body: { 
          title: message.trim(),
          mode: translationMode,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to rewrite content");

      setMessage(data.hebrewDescription);
      toast({
        title: translationMode === "aiRewrite" ? "✨ התוכן נכתב מחדש" : "✅ התוכן תורגם",
        description: "התוכן מוכן לעריכה לפני השליחה",
      });
    } catch (e) {
      toast({
        title: "שגיאה בכתיבה מחדש",
        description: e instanceof Error ? e.message : "נסה שוב",
        variant: "destructive",
      });
    } finally {
      setIsRewriting(false);
    }
  };

  // External AI Rewrite (OpenAI / Gemini) - fetches product data from AliExpress API
  const handleExternalRewrite = async (provider: 'openai' | 'gemini') => {
    if (!message.trim()) {
      toast({ title: "נא להזין טקסט לכתיבה מחדש", variant: "destructive" });
      return;
    }
    setIsRewritingExternal(true);
    try {
      const versionKey = provider;
      const currentVersion = (externalRewriteVersion[versionKey] || 0) % 3 + 1;
      
      // Try to fetch product data from AliExpress API
      let productData: any = null;
      const urlMatch = message.match(/https?:\/\/[^\s]*aliexpress[^\s]*/i) || message.match(/https?:\/\/s\.click\.aliexpress\.com[^\s]*/i);
      if (urlMatch) {
        try {
          const { data: productInfo } = await supabase.functions.invoke("fetch-ali-product", {
            body: { url: urlMatch[0] },
          });
          if (productInfo?.success && productInfo?.product) {
            const p = productInfo.product;
            productData = {
              price: p.price || p.app_sale_price,
              orders: p.orders_count || p.lastest_volume,
              rating: p.rating || p.evaluate_rate,
              link: urlMatch[0],
            };
          }
        } catch (e) {
          console.log("[ManualSend] Could not fetch product data, continuing without it");
        }
      }
      
      const { data, error } = await supabase.functions.invoke("rewrite-openai", {
        body: { text: message.trim(), version: currentVersion, provider, productData },
      });
      if (error) throw error;
      if (data?.success && data?.rewrittenText) {
        setMessage(data.rewrittenText.trim());
        setExternalRewriteVersion(prev => ({ ...prev, [versionKey]: currentVersion }));
        const label = provider === 'openai' ? 'OpenAI' : 'Gemini';
        toast({ title: `✨ ${label} גרסה ${currentVersion} הושלמה` });
      } else {
        toast({ title: data?.error || `שגיאה בניסוח ${provider}`, variant: "destructive" });
      }
    } catch {
      toast({ title: `שגיאה בניסוח`, variant: "destructive" });
    } finally {
      setIsRewritingExternal(false);
    }
  };


  const handleRewriteWithAffiliate = async () => {
    if (!message.trim()) {
      toast({ title: "נא להזין טקסט", variant: "destructive" });
      return;
    }
    if (!userId) {
      toast({ title: "לא מחובר", variant: "destructive" });
      return;
    }

    // Detect AliExpress link in message
    const aliLink = detectAliLink(message);
    if (!aliLink) {
      toast({ title: "לא נמצא קישור אליאקספרס בטקסט", variant: "destructive" });
      return;
    }

    setIsRewritingWithAffiliate(true);
    try {
      // Send the FULL original text to AI (without the link itself)
      const originalText = message.trim();
      // Remove AliExpress links from the text sent to AI (they'll be replaced with affiliate link)
      const textForAi = originalText.replace(/https?:\/\/(?:s\.click\.aliexpress\.com|a\.aliexpress\.com|www\.aliexpress\.com|aliexpress\.com)\S+/gi, '').trim();

      // Run all 3 operations in parallel: AI rewrite, affiliate link, fetch image
      const [rewriteResult, affiliateResult, imageResult] = await Promise.all([
        supabase.functions.invoke("generate-hebrew-post", {
          body: { title: textForAi, manualRewrite: true },
        }),
        supabase.functions.invoke("generate-affiliate-link", {
          body: { productUrl: aliLink, userId },
        }),
        supabase.functions.invoke("fetch-ali-product", {
          body: { productUrl: aliLink },
        }),
      ]);

      // Process AI rewrite
      if (rewriteResult.error) throw new Error("שגיאה בניסוח מחדש: " + rewriteResult.error.message);
      if (!rewriteResult.data?.success) throw new Error(rewriteResult.data?.error || "שגיאה בניסוח מחדש");
      
      // Use AI output directly - prices/coupons are preserved by the AI prompt
      let newMessage = rewriteResult.data.hebrewDescription.trim();

      // Append orders count and rating from product data if not already in text
      if (imageResult.data?.success && imageResult.data?.data) {
        const productData = imageResult.data.data;
        
        // Store fetched stats for later use in product creation
        setFetchedProductStats({
          orders_count: productData.orders_count ? Number(productData.orders_count) : undefined,
          rating: productData.rating ? Number(productData.rating) : undefined,
        });

        const statsLines: string[] = [];

        // Use specific pattern matching to avoid false positives from AI text
        const hasOrdersStat = /מעל\s+[\d,]+\s+הזמנות|📦\s.*הזמנות|👥\s.*הזמנות/.test(newMessage);
        const hasRatingStat = /דירוג[:\s]+[\d.]+\s+מתוך|⭐\s.*דירוג/.test(newMessage);

        if (productData.orders_count && Number(productData.orders_count) > 0 && !hasOrdersStat) {
          const rounded = Math.ceil(Number(productData.orders_count) / 100) * 100;
          statsLines.push(`👥 מעל ${rounded.toLocaleString()} הזמנות`);
        }

        if (productData.rating && Number(productData.rating) > 0 && !hasRatingStat) {
          let r = Number(productData.rating);
          if (r > 5) r = r / 20; // normalize percentage to 5-star
          statsLines.push(`⭐ דירוג: ${r.toFixed(1)} מתוך 5`);
        }

        if (statsLines.length > 0) {
          newMessage = newMessage.trim() + '\n\n' + statsLines.join('\n');
        }
      } else {
        console.warn("[RewriteWithAffiliate] fetch-ali-product failed or returned no data:", imageResult.data);
      }

      // Process affiliate link
      let affiliateLink = aliLink;
      if (affiliateResult.data?.success && affiliateResult.data?.affiliateLink) {
        affiliateLink = affiliateResult.data.affiliateLink;
      } else {
        console.warn("[RewriteWithAffiliate] Affiliate link generation failed, using original link");
        toast({ 
          title: "⚠️ לא הצלחנו להחליף לקישור שותף", 
          description: "הקישור המקורי יישאר",
        });
      }

      // Append CTA with affiliate link
      const ctaOptions = ["לרכישה", "להזמנה", "להזמנה מאליאקספרס"];
      const randomCta = ctaOptions[Math.floor(Math.random() * ctaOptions.length)];
      newMessage = newMessage.trim() + `\n\n👇 ${randomCta}\n${affiliateLink}`;

      setMessage(newMessage);

      // Process image
      if (imageResult.data?.success && imageResult.data?.data?.image_url) {
        setImageUrlPreview(imageResult.data.data.image_url);
        setMediaFile(null);
        setMediaPreview(null);
        setMediaType(null);
      }

      toast({ title: "✨ הפוסט נוסח מחדש עם קישור שותף ותמונה" });
    } catch (e) {
      toast({
        title: "שגיאה",
        description: e instanceof Error ? e.message : "נסה שוב",
        variant: "destructive",
      });
    } finally {
      setIsRewritingWithAffiliate(false);
    }
  };

  // Preview Modal Component
  const PreviewModal = () => (
    <Dialog open={showPreview} onOpenChange={setShowPreview}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-hebrew text-right">תצוגה מקדימה</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Media Preview */}
          {effectiveMediaPreview && (
            <div className="rounded-lg overflow-hidden border border-border relative">
              {effectiveMediaType === "video" ? (
                <video src={effectiveMediaPreview} className="w-full max-h-64" controls />
              ) : (
                <img src={displayMediaPreview || effectiveMediaPreview} alt="Preview" className="w-full object-contain max-h-64" />
              )}
              {addWatermark && watermarkedPreview && effectiveMediaType !== "video" && (
                <Badge variant="secondary" className="absolute top-2 left-2 text-xs font-hebrew">
                  <Stamp className="h-3 w-3 mr-1" /> עם לוגו
                </Badge>
              )}
            </div>
          )}
          
          {/* Message Preview */}
          {message.trim() && (
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <p className="font-hebrew text-right whitespace-pre-wrap leading-relaxed" dir="rtl">
                {message}
              </p>
            </div>
          )}
          
          {!message.trim() && !effectiveMediaPreview && (
            <div className="text-center py-8 text-muted-foreground font-hebrew">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>אין תוכן להצגה</p>
            </div>
          )}
          
          {/* Selected Groups */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground font-hebrew">ישלח ל:</p>
            <div className="flex flex-wrap gap-2">
              {selectedAccounts.length === 0 ? (
                <span className="text-sm text-muted-foreground font-hebrew">לא נבחרו קבוצות</span>
              ) : (
                selectedAccounts.map(accId => {
                  const acc = allAccounts.find(a => a.id === accId);
                  if (!acc) return null;
                  return (
                    <Badge 
                      key={accId} 
                      variant={acc.is_active ? "default" : "secondary"}
                      className="font-hebrew"
                    >
                      {acc.account_type === "telegram" ? "📱" : "💬"} {acc.account_name}
                      {!acc.is_active && " (לא פעיל)"}
                    </Badge>
                  );
                })
              )}
            </div>
          </div>
          
          {/* Send Button */}
          <Button
            onClick={() => {
              setShowPreview(false);
              handleSendNow();
            }}
            disabled={loading || (!message.trim() && !hasMedia) || selectedAccounts.length === 0}
            className="w-full"
            size="lg"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            <span className="font-hebrew">שלח עכשיו ({selectedAccounts.length})</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return (
    <MainLayout>
      <PreviewModal />
      <div className="space-y-6 pb-20 md:pb-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/20">
            <Send className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-hebrew">שליחה ידנית</h1>
            <p className="text-muted-foreground text-sm font-hebrew">
              שלח הודעות, תמונות או וידאו לקבוצות שלך
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
          <div className="space-y-6">
            {/* Message Input */}
            <Card>
              <CardHeader>
                <CardTitle className="font-hebrew flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  תוכן ההודעה
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* AI Rewrite Mode Selector */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <TranslationModeSelector
                      mode={translationMode}
                      onChange={setTranslationMode}
                      disabled={isRewriting}
                      compact
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAiRewrite}
                      disabled={isRewriting || !message.trim()}
                      className="gap-2"
                    >
                      {isRewriting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      <span className="font-hebrew">
                        {translationMode === "aiRewrite" ? "כתוב מחדש" : "תרגם"}
                      </span>
                    </Button>
                   </div>
                  
                  {/* Rewrite + Affiliate Link Button */}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleRewriteWithAffiliate}
                    disabled={isRewritingWithAffiliate || !message.trim() || !detectAliLink(message)}
                    className="w-full gap-2"
                  >
                    {isRewritingWithAffiliate ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link className="h-4 w-4" />
                    )}
                    <span className="font-hebrew">
                      {isRewritingWithAffiliate ? "מעבד..." : "נסח מחדש + לינק אפיליאייט"}
                    </span>
                  </Button>

                  {/* External AI Rewrite Buttons */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExternalRewrite('openai')}
                      disabled={isRewritingExternal || !message.trim()}
                      className="flex-1 gap-2 border-green-500/50 text-green-600 hover:bg-green-50"
                    >
                      {isRewritingExternal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      <span className="font-hebrew">נסח מחדש – OpenAI {externalRewriteVersion['openai'] ? `(v${externalRewriteVersion['openai']})` : ''}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExternalRewrite('gemini')}
                      disabled={isRewritingExternal || !message.trim()}
                      className="flex-1 gap-2 border-blue-500/50 text-blue-600 hover:bg-blue-50"
                    >
                      {isRewritingExternal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      <span className="font-hebrew">נסח מחדש – Gemini {externalRewriteVersion['gemini'] ? `(v${externalRewriteVersion['gemini']})` : ''}</span>
                    </Button>
                  </div>
                </div>
                
                <Textarea
                  placeholder="כתוב את ההודעה שלך כאן או הדבק תיאור מוצר לכתיבה מחדש..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="min-h-[150px] font-hebrew text-right resize-none"
                  dir="rtl"
                />

                {/* Media */}
                <div className="space-y-3">
                  <Label className="font-hebrew">מדיה (אופציונלי)</Label>
                  
                  {/* Album preview (multiple images) */}
                  {mediaFiles.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-hebrew">
                          📸 אלבום - {mediaFiles.length} תמונות
                        </Badge>
                        <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={clearMedia}>
                          נקה הכל
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                        {mediaPreviews.map((preview, idx) => (
                          <div key={idx} className="relative group">
                            <img src={preview} alt={`Image ${idx + 1}`} className="h-20 w-full object-cover rounded-lg border border-border" />
                            <Button
                              variant="destructive"
                              size="icon"
                              className="absolute -top-1 -right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeMultiImage(idx)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        {mediaFiles.length < 10 && (
                          <label className="cursor-pointer h-20 rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex items-center justify-center transition-colors">
                            <input type="file" accept="image/*" multiple className="hidden" onChange={handleMultiImageChange} />
                            <Plus className="h-5 w-5 text-muted-foreground" />
                          </label>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Single media preview */}
                  {mediaFiles.length === 0 && effectiveMediaPreview && (
                    <div className="relative inline-block">
                      {effectiveMediaType === "video" ? (
                        <video src={effectiveMediaPreview} className="max-h-48 rounded-lg border border-border" controls />
                      ) : (
                        <img src={displayMediaPreview || effectiveMediaPreview} alt="Preview" className="max-h-48 rounded-lg border border-border" />
                      )}
                      {addWatermark && watermarkedPreview && effectiveMediaType !== "video" && (
                        <Badge variant="secondary" className="absolute top-2 left-2 text-xs font-hebrew">
                          <Stamp className="h-3 w-3 mr-1" /> עם לוגו
                        </Badge>
                      )}
                      <Button variant="destructive" size="icon-sm" className="absolute -top-2 -right-2" onClick={clearMedia}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {/* Upload buttons - show when no media */}
                  {mediaFiles.length === 0 && !effectiveMediaPreview && (
                    <div className="space-y-3">
                      {/* Auto-detect AliExpress link */}
                      {detectedLink && (
                        <Button
                          variant="outline"
                          onClick={handleFetchImageFromLink}
                          disabled={loadingImageFromLink}
                          className="w-full gap-2"
                        >
                          {loadingImageFromLink ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Link className="h-4 w-4" />
                          )}
                          <span className="font-hebrew">
                            {loadingImageFromLink ? "טוען תמונה מהקישור..." : "🔗 טען תמונה מקישור אליאקספרס"}
                          </span>
                        </Button>
                      )}
                      
                      {/* Upload file */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground font-hebrew">
                          {detectedLink ? "או העלה קובץ:" : "העלה קובץ:"}
                        </span>
                        <label className="cursor-pointer">
                          <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                          <Button variant="outline" size="sm" asChild>
                            <span className="flex items-center gap-2">
                              <ImageIcon className="h-4 w-4" />
                              <span className="font-hebrew">תמונה</span>
                            </span>
                          </Button>
                        </label>
                        <label className="cursor-pointer">
                          <input type="file" accept="image/*" multiple className="hidden" onChange={handleMultiImageChange} />
                          <Button variant="outline" size="sm" asChild>
                            <span className="flex items-center gap-2">
                              <ImageIcon className="h-4 w-4" />
                              <span className="font-hebrew">אלבום תמונות</span>
                            </span>
                          </Button>
                        </label>
                        <label className="cursor-pointer">
                          <input type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
                          <Button variant="outline" size="sm" asChild>
                            <span className="flex items-center gap-2">
                              <Video className="h-4 w-4" />
                              <span className="font-hebrew">וידאו</span>
                            </span>
                          </Button>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Watermark Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Stamp className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <Label className="font-hebrew text-sm cursor-pointer">חותמת מים (לוגו)</Label>
                      <p className="text-xs text-muted-foreground font-hebrew">הוסף לוגו בפינה הימנית התחתונה</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {watermarkPreview && (
                      <img src={watermarkPreview} alt="Logo" className="h-6 w-6 rounded object-contain" />
                    )}
                    <Switch checked={addWatermark} onCheckedChange={(v) => {
                      setAddWatermark(v);
                      if (v && !watermarkPreview) {
                        document.getElementById("watermark-input")?.click();
                      }
                    }} />
                  </div>
                </div>
                {addWatermark && (
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer">
                      <input id="watermark-input" type="file" accept="image/*" className="hidden" onChange={handleWatermarkFileChange} />
                      <Button variant="outline" size="sm" asChild>
                        <span className="flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" />
                          <span className="font-hebrew">{watermarkPreview ? "החלף לוגו" : "בחר לוגו"}</span>
                        </span>
                      </Button>
                    </label>
                    {watermarkPreview && (
                      <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={() => {
                        setWatermarkPreview(null);
                        setWatermarkFile(null);
                        setAddWatermark(false);
                        localStorage.removeItem("watermark_logo");
                      }}>
                        <X className="h-3 w-3 ml-1" />
                        <span className="font-hebrew">הסר</span>
                      </Button>
                    )}
                  </div>
                )}

                {/* Zone Selector */}
                <ZoneSelector
                  selectedZones={selectedZones}
                  onSelectionChange={setSelectedZones}
                />

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={handleSendNow}
                      disabled={loading || (!message.trim() && !hasMedia) || selectedAccounts.length === 0}
                      size="lg"
                    >
                      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                      <span className="font-hebrew">שלח ({selectedAccounts.length})</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setShowPreview(true)}
                      disabled={!message.trim() && !hasMedia}
                      size="lg"
                    >
                      <Eye className="h-5 w-5" />
                      <span className="font-hebrew">תצוגה מקדימה</span>
                    </Button>
                  </div>

                  {/* Send + Add to Automation */}
                  <Button
                    variant="secondary"
                    onClick={handleSendAndAddToAutomation}
                    disabled={loading || (!message.trim() && !hasMedia) || selectedAccounts.length === 0}
                    className="w-full"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /><Clock className="h-4 w-4" /></>}
                    <span className="font-hebrew">שלח והוסף לאוטומט</span>
                  </Button>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Button
                      variant="outline"
                      onClick={handleAddToManualQueue}
                      disabled={loading || (!message.trim() && !hasMedia)}
                      className="text-xs sm:text-sm"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span className="font-hebrew truncate">ידנית</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleAddToAutomationOnly}
                      disabled={loading || (!message.trim() && !hasMedia)}
                      className="text-xs sm:text-sm"
                    >
                      <Clock className="h-4 w-4 shrink-0" />
                      <span className="font-hebrew truncate">אוטומט</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleAddToBoth}
                      disabled={loading || (!message.trim() && !hasMedia)}
                      className="text-xs sm:text-sm"
                    >
                      <Layers className="h-4 w-4 shrink-0" />
                      <span className="font-hebrew truncate">שתיהן</span>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleAddToZoneOnly}
                      disabled={loading || (!message.trim() && !hasMedia) || selectedZones.length === 0}
                      className="text-xs sm:text-sm"
                    >
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span className="font-hebrew truncate">לאזור ({selectedZones.length})</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Manual Queue */}
            <Card>
              <CardHeader>
                <CardTitle className="font-hebrew flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  מחסנית ידנית ({manualQueue.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingQueue ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : manualQueue.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground font-hebrew">
                    <p>המחסנית ריקה</p>
                    <p className="text-sm mt-1">הוסף הודעות כדי לשלוח אותן מאוחר יותר</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {manualQueue.map((item) => (
                      <div
                        key={item.id}
                        className="p-4 rounded-lg border border-border bg-card/50 space-y-3"
                      >
                        <div className="flex gap-3">
                          {item.media_url && (
                            <div className="flex-shrink-0">
                              {item.media_type === "video" ? (
                                <video src={item.media_url} className="h-16 w-16 rounded object-cover" />
                              ) : (
                                <img src={item.media_url} alt="" className="h-16 w-16 rounded object-cover" />
                              )}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-hebrew text-right line-clamp-2" dir="rtl">
                              {item.message || "(ללא טקסט)"}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 font-hebrew">
                              {format(new Date(item.created_at), "dd/MM HH:mm", { locale: he })}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSendQueueItem(item)}
                            disabled={sendingItemId === item.id || selectedAccounts.length === 0}
                            className="flex-1"
                          >
                            {sendingItemId === item.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                            <span className="font-hebrew">שלח</span>
                          </Button>
                          <Button
                            variant="ghost-destructive"
                            size="sm"
                            onClick={() => handleDeleteQueueItem(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Account Selection */}
          <Card className="h-fit">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-hebrew">קבוצות יעד</CardTitle>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs font-hebrew px-2">
                    הכל
                  </Button>
                  <Button variant="ghost" size="sm" onClick={selectActiveOnly} className="text-xs font-hebrew px-2">
                    פעילים
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll} className="text-xs font-hebrew px-2">
                    נקה
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingAccounts ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : allAccounts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground font-hebrew">
                  <p>אין קבוצות מוגדרות</p>
                  <p className="text-sm mt-1">הגדר חשבונות בהגדרות</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground font-hebrew text-center">
                    קבוצות לא פעילות מסומנות באפור (לא יקבלו אוטומציה)
                  </p>
                  {telegramAccounts.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground font-hebrew flex items-center gap-2">
                        <span className="text-lg">📱</span>
                        טלגרם
                      </h3>
                      {telegramAccounts.map(account => (
                        <label
                          key={account.id}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all relative",
                            selectedAccounts.includes(account.id)
                              ? "border-primary/50 bg-primary/5"
                              : "border-border hover:border-primary/30",
                            !account.is_active && "opacity-60"
                          )}
                        >
                          <Checkbox
                            checked={selectedAccounts.includes(account.id)}
                            onCheckedChange={() => toggleAccount(account.id)}
                          />
                          <span className="font-hebrew text-sm flex-1 text-right flex items-center gap-2">
                            {account.account_name}
                            {!account.is_active && (
                              <Badge variant="outline" className="text-xs font-hebrew">לא פעיל</Badge>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {whatsappAccounts.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground font-hebrew flex items-center gap-2">
                        <span className="text-lg">💬</span>
                        וואטסאפ
                      </h3>
                      {whatsappAccounts.map(account => (
                        <label
                          key={account.id}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all relative",
                            selectedAccounts.includes(account.id)
                              ? "border-primary/50 bg-primary/5"
                              : "border-border hover:border-primary/30",
                            !account.is_active && "opacity-60"
                          )}
                        >
                          <Checkbox
                            checked={selectedAccounts.includes(account.id)}
                            onCheckedChange={() => toggleAccount(account.id)}
                          />
                          <span className="font-hebrew text-sm flex-1 text-right flex items-center gap-2">
                            {account.account_name}
                            {!account.is_active && (
                              <Badge variant="outline" className="text-xs font-hebrew">לא פעיל</Badge>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
