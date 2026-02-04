import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Send, 
  Image as ImageIcon, 
  Video, 
  Upload, 
  X, 
  Loader2,
  MessageSquare
} from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function ManualSend() {
  const [message, setMessage] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | null>(null);
  const [accounts, setAccounts] = useState<MessagingAccount[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
    getCurrentUser();
  }, []);

  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);
  };

  const fetchAccounts = async () => {
    try {
      const { data, error } = await supabase.rpc("get_my_messaging_accounts_safe");
      if (error) throw error;
      
      // Filter only active accounts with configured credentials
      const activeAccounts = (data || []).filter((acc: MessagingAccount) => {
        if (!acc.is_active) return false;
        if (acc.account_type === "telegram") {
          return acc.has_bot_token && acc.telegram_chat_id;
        }
        if (acc.account_type === "whatsapp") {
          return acc.has_api_token && acc.has_instance_id && acc.whatsapp_chat_id;
        }
        return false;
      });
      
      setAccounts(activeAccounts);
      // Auto-select all active accounts
      setSelectedAccounts(activeAccounts.map((acc: MessagingAccount) => acc.id));
    } catch (error) {
      console.error("Error fetching accounts:", error);
      toast({
        title: "שגיאה בטעינת הקבוצות",
        variant: "destructive"
      });
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
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

    // Check file size (max 50MB for video, 10MB for image)
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

  const clearMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setMediaType(null);
  };

  const toggleAccount = (accountId: string) => {
    setSelectedAccounts(prev => 
      prev.includes(accountId) 
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  const selectAll = () => {
    setSelectedAccounts(accounts.map(acc => acc.id));
  };

  const deselectAll = () => {
    setSelectedAccounts([]);
  };

  const uploadMediaToStorage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `manual-send/${userId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(fileName, file, { upsert: true });

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

  const handleSend = async () => {
    if (!message.trim() && !mediaFile) {
      toast({
        title: "נא להזין הודעה או להעלות מדיה",
        variant: "destructive"
      });
      return;
    }

    if (selectedAccounts.length === 0) {
      toast({
        title: "נא לבחור לפחות קבוצה אחת",
        variant: "destructive"
      });
      return;
    }

    if (!userId) {
      toast({
        title: "לא מחובר",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      // Upload media if exists
      let mediaUrl: string | null = null;
      if (mediaFile) {
        mediaUrl = await uploadMediaToStorage(mediaFile);
        if (!mediaUrl) {
          throw new Error("Failed to upload media");
        }
      }

      const results = { success: 0, failed: 0 };

      // Send to each selected account
      for (const accountId of selectedAccounts) {
        const account = accounts.find(acc => acc.id === accountId);
        if (!account) continue;

        try {
          const endpoint = account.account_type === "telegram" 
            ? "send-telegram" 
            : "send-whatsapp";

          const { data, error } = await supabase.functions.invoke(endpoint, {
            body: {
              title: "",
              hebrewDescription: message,
              price: 0,
              imageUrl: mediaUrl,
              affiliateLink: null,
              userId,
              accountId
            }
          });

          if (error || !data?.success) {
            console.error(`Error sending to ${account.account_name}:`, error || data?.error);
            results.failed++;
          } else {
            results.success++;
          }
        } catch (err) {
          console.error(`Error sending to ${account.account_name}:`, err);
          results.failed++;
        }
      }

      if (results.success > 0) {
        toast({
          title: `נשלח בהצלחה ל-${results.success} קבוצות`,
          description: results.failed > 0 ? `${results.failed} שליחות נכשלו` : undefined
        });
        
        // Clear form on success
        setMessage("");
        clearMedia();
      } else {
        toast({
          title: "כל השליחות נכשלו",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Error sending:", error);
      toast({
        title: "שגיאה בשליחה",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const telegramAccounts = accounts.filter(acc => acc.account_type === "telegram");
  const whatsappAccounts = accounts.filter(acc => acc.account_type === "whatsapp");

  return (
    <MainLayout>
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
          {/* Message Input */}
          <Card>
            <CardHeader>
              <CardTitle className="font-hebrew flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                תוכן ההודעה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Text Input */}
              <Textarea
                placeholder="כתוב את ההודעה שלך כאן..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[200px] font-hebrew text-right resize-none"
                dir="rtl"
              />

              {/* Media Upload */}
              <div className="space-y-3">
                <Label className="font-hebrew">מדיה (אופציונלי)</Label>
                
                {mediaPreview ? (
                  <div className="relative inline-block">
                    {mediaType === "image" ? (
                      <img 
                        src={mediaPreview} 
                        alt="Preview" 
                        className="max-h-48 rounded-lg border border-border"
                      />
                    ) : (
                      <video 
                        src={mediaPreview} 
                        className="max-h-48 rounded-lg border border-border"
                        controls
                      />
                    )}
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      className="absolute -top-2 -right-2"
                      onClick={clearMedia}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <Button variant="outline" asChild>
                        <span className="flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" />
                          <span className="font-hebrew">תמונה</span>
                        </span>
                      </Button>
                    </label>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <Button variant="outline" asChild>
                        <span className="flex items-center gap-2">
                          <Video className="h-4 w-4" />
                          <span className="font-hebrew">וידאו</span>
                        </span>
                      </Button>
                    </label>
                  </div>
                )}
              </div>

              {/* Send Button */}
              <Button
                onClick={handleSend}
                disabled={loading || (!message.trim() && !mediaFile) || selectedAccounts.length === 0}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="font-hebrew">שולח...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    <span className="font-hebrew">שלח ל-{selectedAccounts.length} קבוצות</span>
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Account Selection */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-hebrew">קבוצות יעד</CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs font-hebrew">
                    בחר הכל
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll} className="text-xs font-hebrew">
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
              ) : accounts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground font-hebrew">
                  <p>אין קבוצות פעילות</p>
                  <p className="text-sm mt-1">הגדר חשבונות בהגדרות</p>
                </div>
              ) : (
                <>
                  {/* Telegram Accounts */}
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
                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                            selectedAccounts.includes(account.id)
                              ? "border-primary/50 bg-primary/5"
                              : "border-border hover:border-primary/30"
                          )}
                        >
                          <Checkbox
                            checked={selectedAccounts.includes(account.id)}
                            onCheckedChange={() => toggleAccount(account.id)}
                          />
                          <span className="font-hebrew text-sm flex-1 text-right">
                            {account.account_name}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* WhatsApp Accounts */}
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
                            "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                            selectedAccounts.includes(account.id)
                              ? "border-primary/50 bg-primary/5"
                              : "border-border hover:border-primary/30"
                          )}
                        >
                          <Checkbox
                            checked={selectedAccounts.includes(account.id)}
                            onCheckedChange={() => toggleAccount(account.id)}
                          />
                          <span className="font-hebrew text-sm flex-1 text-right">
                            {account.account_name}
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
