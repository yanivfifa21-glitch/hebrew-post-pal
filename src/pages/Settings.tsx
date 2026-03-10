import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Settings as SettingsIcon, 
  Clock, 
  Save, 
  Loader2, 
  Plus, 
  X, 
  Sparkles,
  ShoppingBag,
  Zap,
  Power,
  Trash2,
  Calendar,
  RotateCcw,
  Moon,
  Timer,
  Check,
  AlertCircle,
  Edit,
  MessageSquare,
  RefreshCw,
  Play,
  Send
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// Write-only credential input component - never shows actual values
interface SecureCredentialInputProps {
  label: string;
  placeholder?: string;
  description?: string;
  isConfigured: boolean;
  onUpdate: (value: string) => void;
  value: string;
}

const SecureCredentialInput = ({ 
  label, 
  placeholder, 
  description, 
  isConfigured, 
  onUpdate, 
  value 
}: SecureCredentialInputProps) => {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {isConfigured && !isEditing && (
          <Badge variant="outline" className="text-green-600 border-green-600/50 bg-green-50">
            <Check className="h-3 w-3 mr-1" />
            Configured
          </Badge>
        )}
        {!isConfigured && !isEditing && (
          <Badge variant="outline" className="text-amber-600 border-amber-600/50 bg-amber-50">
            <AlertCircle className="h-3 w-3 mr-1" />
            Not Set
          </Badge>
        )}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      
      {isEditing ? (
        <div className="space-y-2">
          <Input
            type="password"
            value={value}
            onChange={(e) => onUpdate(e.target.value)}
            placeholder={placeholder}
          />
          <p className="text-xs text-muted-foreground">
            Enter a new value to update. Leave empty to keep current.
          </p>
          <Button 
            type="button" 
            variant="ghost" 
            size="sm"
            onClick={() => {
              setIsEditing(false);
              onUpdate('');
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button 
          type="button" 
          variant="outline" 
          className="w-full justify-start text-muted-foreground"
          onClick={() => setIsEditing(true)}
        >
          <Edit className="h-4 w-4 mr-2" />
          {isConfigured ? "Update credential..." : "Set credential..."}
        </Button>
      )}
    </div>
  );
};

interface MessagingAccount {
  id: string;
  account_type: string;
  account_name: string;
  is_active: boolean;
  telegram_chat_id?: string | null;
  whatsapp_chat_id?: string | null;
}

interface CredentialsStatus {
  has_telegram_token: boolean;
  has_telegram_chat_id: boolean;
  has_greenapi_token: boolean;
  has_greenapi_instance: boolean;
  has_greenapi_chat_id: boolean;
  has_aliexpress_secret: boolean;
  has_aliexpress_key: boolean;
}

interface AccountCredentialsStatus {
  has_bot_token?: boolean;
  has_telegram_chat_id?: boolean;
  has_api_token?: boolean;
  has_instance_id?: boolean;
  has_whatsapp_chat_id?: boolean;
}

// Fixed default prompt template for standard translation
const DEFAULT_PROMPT = `אתה משווק שותפים ישראלי. המידע שמתקבל הוא Product Desc באנגלית.

מטרה: כתוב פוסט שיווקי בעברית בלבד (מותר להשאיר שם מותג באנגלית אם חייב).

מבנה חובה:
[אימוג'י פתיחה + שם המוצר בעברית | Brand באנגלית אם יש]

[2–3 שורות תיאור קצרות בעברית:
מה זה המוצר,
למה הוא שימושי,
ומה היתרון המרכזי שלו]

⭐ דירוג: [X.X] מתוך 5
👥 מעל [כמות הזמנות] הזמנות

🔗 לפרטים והזמנה >> [קישור]

כללים קריטיים:
- אל תוסיף מחיר או קופון
- אל תוסיף קישור (הקישור יתווסף אוטומטית)
- אל תכתוב משפטי CTA כמו "לחץ כאן"
- הקישור יתווסף אוטומטית - רק כתוב [קישור] כ-placeholder`;

// Default AI Rewrite template - Telegram style marketing
const DEFAULT_AI_REWRITE_TEMPLATE = `אתה עורך תוכן מקצועי לקבוצות טלגרם ישראליות.
המידע שמתקבל הוא תיאור מוצר בכל שפה. המשימה שלך היא לכתוב מחדש את התוכן כפוסט שיווקי בעברית טבעית.

זה לא תרגום - זו כתיבה מחדש כמו שאדם ישראלי היה כותב.

מבנה הפוסט:
[אימוג'י אחד + כותרת מוצר קצרה וקליטה בעברית]

[2-3 משפטים קצרים:
- משפט 1: תכונה טכנית מרכזית (חומרים, גודל, עוצמה)
- משפט 2: יתרון פרקטי ספציפי
- משפט 3: עוד תכונה או יתרון]

כללים קריטיים:
- עברית בלבד
- טון ישראלי טבעי ופשוט
- משפטים קצרים וטכניים
- פורמט טלגרם נקי
- אסור מחירים אלא אם נאמר במפורש
- אסור ניסוחים רובוטיים או "סגנון אליאקספרס"
- שימוש מינימלי באימוג'י - רק אחד בכותרת
- אסור קריאות לפעולה (CTA) - הקישור יתווסף אוטומטית
- אסור לכתוב "לחץ כאן", "להזמנה", "לרכישה" וכד'

** אסור לגמרי **
- אסור משפטי השראה כמו: "שקט נפשי", "חוויה", "תהנו מ...", "תשכחו מ...", "פתחו את הדלת ל..."
- אסור משפטים גנריים כמו: "מתאים לשימוש יומיומי", "איכות מעולה", "מחיר משתלם"
- אסור לפתוח משפט עם: "זוהי", "זהו", "הוא", "היא", "מדובר ב"
- אסור לסיים עם משפטי סיכום או עידוד

המטרה: הפוסט צריך להיראות כאילו נכתב ע"י עורך תוכן טכני, לא כתרגום או פרסומת.`;

const Settings = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Credentials status (boolean flags, not actual values)
  const [credentialsStatus, setCredentialsStatus] = useState<CredentialsStatus>({
    has_telegram_token: false,
    has_telegram_chat_id: false,
    has_greenapi_token: false,
    has_greenapi_instance: false,
    has_greenapi_chat_id: false,
    has_aliexpress_secret: false,
    has_aliexpress_key: false,
  });
  
  // New credential values to save (write-only)
  const [newTelegramBotToken, setNewTelegramBotToken] = useState('');
  const [newTelegramChatId, setNewTelegramChatId] = useState('');
  const [newGreenApiToken, setNewGreenApiToken] = useState('');
  const [newGreenApiInstance, setNewGreenApiInstance] = useState('');
  const [newGreenApiChatId, setNewGreenApiChatId] = useState('');
  const [newAliexpressKey, setNewAliexpressKey] = useState('');
  const [newAliexpressSecret, setNewAliexpressSecret] = useState('');
  
  // Master automation toggle
  const [automationEnabled, setAutomationEnabled] = useState(false);
  
  // Posting times
  const [postingTimes, setPostingTimes] = useState<string[]>(['10:00', '14:00', '20:00']);
  const [newTime, setNewTime] = useState('');
  
  // Interval posting (now in MINUTES) - Global fallback
  const [postingIntervalMinutes, setPostingIntervalMinutes] = useState<number | null>(null);
  const [useIntervalPosting, setUseIntervalPosting] = useState(false);
  const [intervalStartTime, setIntervalStartTime] = useState('08:00');
  const [intervalEndTime, setIntervalEndTime] = useState('22:00');
  
  // Separate channel interval settings
  const [useSeparateIntervals, setUseSeparateIntervals] = useState(false);
  const [whatsappIntervalMinutes, setWhatsappIntervalMinutes] = useState<number | null>(null);
  const [telegramIntervalMinutes, setTelegramIntervalMinutes] = useState<number | null>(null);
  const [whatsappIntervalStart, setWhatsappIntervalStart] = useState('08:00');
  const [whatsappIntervalEnd, setWhatsappIntervalEnd] = useState('22:00');
  const [telegramIntervalStart, setTelegramIntervalStart] = useState('08:00');
  const [telegramIntervalEnd, setTelegramIntervalEnd] = useState('22:00');
  
  // Separate API save state
  const [isSavingApi, setIsSavingApi] = useState(false);
  
  // Shabbat mode
  const [shabbatModeEnabled, setShabbatModeEnabled] = useState(false);
  const [shabbatStartTime, setShabbatStartTime] = useState('14:00');
  const [shabbatEndTime, setShabbatEndTime] = useState('20:00');
  
  // Publishing days (0=Sunday, 6=Saturday)
  const [publishingDays, setPublishingDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  // AliExpress tracking ID (non-sensitive)
  const [aliexpressTrackingId, setAliexpressTrackingId] = useState('');

  // Custom AI prompt
  const [customAiPrompt, setCustomAiPrompt] = useState('');

  // AI Rewrite template
  const [aiRewriteTemplate, setAiRewriteTemplate] = useState('');

  // USD Exchange rate
  const [usdExchangeRate, setUsdExchangeRate] = useState<number>(3.7);

  // Multi-account management
  const [messagingAccounts, setMessagingAccounts] = useState<MessagingAccount[]>([]);
  const [showAddAccountDialog, setShowAddAccountDialog] = useState<'telegram' | 'whatsapp' | null>(null);
  const [editingAccount, setEditingAccount] = useState<MessagingAccount | null>(null);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountTelegramToken, setNewAccountTelegramToken] = useState('');
  const [newAccountTelegramChatId, setNewAccountTelegramChatId] = useState('');
  const [newAccountGreenApiInstanceId, setNewAccountGreenApiInstanceId] = useState('');
  const [newAccountGreenApiToken, setNewAccountGreenApiToken] = useState('');
  const [newAccountGreenApiChatId, setNewAccountGreenApiChatId] = useState('');
  const [isSavingAccount, setIsSavingAccount] = useState(false);

  const [isResettingStuck, setIsResettingStuck] = useState(false);
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  const [isStartingPublish, setIsStartingPublish] = useState(false);

  // Custom emoji settings
  const [useCustomEmoji, setUseCustomEmoji] = useState(true);
  const [emojiMappings, setEmojiMappings] = useState<{id: string; emoji: string; custom_emoji_id: string}[]>([]);
  const [newEmoji, setNewEmoji] = useState('');
  const [newEmojiId, setNewEmojiId] = useState('');

  // Gold Post state
  const [goldPosts, setGoldPosts] = useState<any[]>([]);
  const [goldMessage, setGoldMessage] = useState('');
  const [goldMediaUrl, setGoldMediaUrl] = useState('');
  const [goldMediaType, setGoldMediaType] = useState('image');
  const [goldSendTime, setGoldSendTime] = useState('12:00');
  const [goldTargetAccounts, setGoldTargetAccounts] = useState<string[]>([]);
  const [goldIsActive, setGoldIsActive] = useState(true);
  const [editingGoldPost, setEditingGoldPost] = useState<any | null>(null);
  const [isSavingGoldPost, setIsSavingGoldPost] = useState(false);
  const [isUploadingGoldMedia, setIsUploadingGoldMedia] = useState(false);

  // OpenAI & Gemini API keys
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');

  const fetchBankIsraelRate = async () => {
    setIsFetchingRate(true);
    try {
      // Bank of Israel API for USD exchange rate
      const response = await fetch('https://www.boi.org.il/PublicApi/GetExchangeRates?asXml=false');
      const data = await response.json();
      
      // Find USD rate
      const usdRate = data.exchangeRates?.find((rate: any) => rate.key === 'USD');
      if (usdRate?.currentExchangeRate) {
        setUsdExchangeRate(parseFloat(usdRate.currentExchangeRate));
        toast({
          title: "שער עודכן!",
          description: `שער דולר עודכן ל-₪${usdRate.currentExchangeRate}`,
        });
      } else {
        throw new Error('Could not find USD rate');
      }
    } catch (error) {
      console.error('Error fetching BOI rate:', error);
      toast({
        title: "שגיאה בעדכון שער",
        description: "לא ניתן לקבל שער מבנק ישראל. נסה שוב מאוחר יותר.",
        variant: "destructive",
      });
    } finally {
      setIsFetchingRate(false);
    }
  };

  const handleStartPublishing = async () => {
    setIsStartingPublish(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({
          title: "שגיאת התחברות",
          description: "נא להתחבר מחדש",
          variant: "destructive",
        });
        return;
      }

      const response = await supabase.functions.invoke('start-publishing', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      const result = response.data;

      if (result.success) {
        setAutomationEnabled(true);
        toast({
          title: "🎉 הפרסום התחיל!",
          description: result.message,
        });
      } else {
        toast({
          title: "שגיאה בפרסום",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Start publishing error:', error);
      toast({
        title: "שגיאה",
        description: error instanceof Error ? error.message : "שגיאה בהפעלת פרסום",
        variant: "destructive",
      });
    } finally {
      setIsStartingPublish(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      setUserId(user.id);

      // Fetch app settings (non-sensitive data only)
      const { data, error } = await supabase
        .from('app_settings')
        .select('id, automation_enabled, posting_times, publishing_days, aliexpress_tracking_id, custom_ai_prompt, ai_rewrite_template, posting_interval_hours, posting_interval_minutes, shabbat_mode_enabled, shabbat_start_time, shabbat_end_time, interval_start_time, interval_end_time, usd_exchange_rate, whatsapp_interval_minutes, telegram_interval_minutes, whatsapp_interval_start_time, whatsapp_interval_end_time, telegram_interval_start_time, telegram_interval_end_time, use_custom_emoji, openai_api_key')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettingsId(data.id);
        setAutomationEnabled(data.automation_enabled || false);
        setPostingTimes(data.posting_times || ['10:00', '14:00', '20:00']);
        setPublishingDays(data.publishing_days || [0, 1, 2, 3, 4, 5, 6]);
        setAliexpressTrackingId(data.aliexpress_tracking_id || '');
        // Use new minutes column, fallback to hours*60
        const intervalMins = (data as any).posting_interval_minutes || (data.posting_interval_hours ? data.posting_interval_hours * 60 : null);
        setPostingIntervalMinutes(intervalMins);
        setUseIntervalPosting(!!intervalMins);
        setShabbatModeEnabled(data.shabbat_mode_enabled || false);
        setShabbatStartTime(data.shabbat_start_time || '14:00');
        setShabbatEndTime(data.shabbat_end_time || '20:00');
        setIntervalStartTime((data as any).interval_start_time || '08:00');
        setIntervalEndTime((data as any).interval_end_time || '22:00');
        setUsdExchangeRate((data as any).usd_exchange_rate || 3.7);
        
        // Separate channel intervals
        const waInterval = (data as any).whatsapp_interval_minutes;
        const tgInterval = (data as any).telegram_interval_minutes;
        setWhatsappIntervalMinutes(waInterval);
        setTelegramIntervalMinutes(tgInterval);
        setUseSeparateIntervals(!!(waInterval || tgInterval));
        setWhatsappIntervalStart((data as any).whatsapp_interval_start_time || '08:00');
        setWhatsappIntervalEnd((data as any).whatsapp_interval_end_time || '22:00');
        setTelegramIntervalStart((data as any).telegram_interval_start_time || '08:00');
        setTelegramIntervalEnd((data as any).telegram_interval_end_time || '22:00');
        
        // Set custom prompt - use saved value or default
        setCustomAiPrompt(data.custom_ai_prompt && data.custom_ai_prompt.trim() !== '' 
          ? data.custom_ai_prompt 
          : DEFAULT_PROMPT);
        
        // Set AI Rewrite template - use saved value or default
        setAiRewriteTemplate((data as any).ai_rewrite_template && (data as any).ai_rewrite_template.trim() !== '' 
          ? (data as any).ai_rewrite_template 
          : DEFAULT_AI_REWRITE_TEMPLATE);
        // Custom emoji toggle
        setUseCustomEmoji((data as any).use_custom_emoji !== false);
        setOpenaiApiKey((data as any).openai_api_key || '');
        setGeminiApiKey((data as any).gemini_api_key || '');
      } else {
        // No settings yet - use defaults
        setCustomAiPrompt(DEFAULT_PROMPT);
        setAiRewriteTemplate(DEFAULT_AI_REWRITE_TEMPLATE);
      }

      // Fetch emoji mappings
      const { data: emojiData } = await supabase
        .from('custom_emoji_mappings')
        .select('id, emoji, custom_emoji_id')
        .eq('user_id', user.id);
      
      setEmojiMappings(emojiData || []);

      // Fetch credentials status (boolean flags only)
      const { data: credStatus, error: credError } = await supabase.rpc('get_my_credentials_status');
      
      if (!credError && credStatus && typeof credStatus === 'object' && !Array.isArray(credStatus)) {
        setCredentialsStatus(credStatus as unknown as CredentialsStatus);
      }

      // Fetch messaging accounts via secure RPC (limited data - no tokens)
      const { data: accounts, error: accountsErr } = await supabase.rpc('get_my_messaging_accounts_safe');

      if (accountsErr) throw accountsErr;
      setMessagingAccounts((accounts || []).map((acc: any) => ({
        id: acc.id,
        account_type: acc.account_type,
        account_name: acc.account_name,
        is_active: acc.is_active,
        telegram_chat_id: acc.telegram_chat_id,
        whatsapp_chat_id: acc.whatsapp_chat_id,
      })));

      // Fetch gold posts
      const { data: goldPostsData } = await supabase
        .from('gold_posts' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setGoldPosts(goldPostsData || []);

    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({
        title: "Error",
        description: "Failed to load settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Update app_settings
      const updateData: Record<string, unknown> = {
        automation_enabled: automationEnabled,
        posting_times: postingTimes,
        publishing_days: publishingDays,
        aliexpress_tracking_id: aliexpressTrackingId || null,
        custom_ai_prompt: customAiPrompt || null,
        ai_rewrite_template: aiRewriteTemplate || null,
        posting_interval_minutes: useIntervalPosting && !useSeparateIntervals ? postingIntervalMinutes : null,
        posting_interval_hours: null,
        shabbat_mode_enabled: shabbatModeEnabled,
        shabbat_start_time: shabbatStartTime,
        shabbat_end_time: shabbatEndTime,
        interval_start_time: intervalStartTime,
        interval_end_time: intervalEndTime,
        usd_exchange_rate: usdExchangeRate,
        use_custom_emoji: useCustomEmoji,
        whatsapp_interval_minutes: useSeparateIntervals ? whatsappIntervalMinutes : null,
        telegram_interval_minutes: useSeparateIntervals ? telegramIntervalMinutes : null,
        whatsapp_interval_start_time: useSeparateIntervals ? whatsappIntervalStart : '08:00',
        whatsapp_interval_end_time: useSeparateIntervals ? whatsappIntervalEnd : '22:00',
        telegram_interval_start_time: useSeparateIntervals ? telegramIntervalStart : '08:00',
        telegram_interval_end_time: useSeparateIntervals ? telegramIntervalEnd : '22:00',
        openai_api_key: openaiApiKey || null,
        gemini_api_key: geminiApiKey || null,
      };

      if (settingsId) {
        const { error } = await supabase
          .from('app_settings')
          .update(updateData)
          .eq('id', settingsId);
        if (error) throw error;
      } else {
        if (!userId) throw new Error("Not authenticated");
        const { data, error } = await supabase
          .from('app_settings')
          .insert({ ...updateData, user_id: userId })
          .select('id')
          .single();
        if (error) throw error;
        setSettingsId(data.id);
      }

      // Update credentials via secure RPC (write-only)
      const credentialsToUpdate: Record<string, string | null> = {};
      
      if (newTelegramBotToken) credentialsToUpdate.p_telegram_bot_token = newTelegramBotToken;
      if (newTelegramChatId) credentialsToUpdate.p_telegram_chat_id = newTelegramChatId;
      if (newGreenApiToken) credentialsToUpdate.p_greenapi_api_token = newGreenApiToken;
      if (newGreenApiInstance) credentialsToUpdate.p_greenapi_instance_id = newGreenApiInstance;
      if (newGreenApiChatId) credentialsToUpdate.p_greenapi_chat_id = newGreenApiChatId;
      if (newAliexpressKey) credentialsToUpdate.p_aliexpress_app_key = newAliexpressKey;
      if (newAliexpressSecret) credentialsToUpdate.p_aliexpress_app_secret = newAliexpressSecret;

      if (Object.keys(credentialsToUpdate).length > 0) {
        const { error: credError } = await supabase.rpc('update_my_credentials', credentialsToUpdate);
        if (credError) throw credError;
        
        // Clear input fields
        setNewTelegramBotToken('');
        setNewTelegramChatId('');
        setNewGreenApiToken('');
        setNewGreenApiInstance('');
        setNewGreenApiChatId('');
        setNewAliexpressKey('');
        setNewAliexpressSecret('');
        
        // Refresh credentials status
        const { data: credStatus } = await supabase.rpc('get_my_credentials_status');
        if (credStatus && typeof credStatus === 'object' && !Array.isArray(credStatus)) {
          setCredentialsStatus(credStatus as unknown as CredentialsStatus);
        }
      }

      // Clear any scroll lock that might have occurred
      requestAnimationFrame(() => {
        document.body.style.removeProperty("overflow");
        document.body.style.removeProperty("padding-right");
        document.body.removeAttribute("data-scroll-locked");
        document.documentElement.style.removeProperty("overflow");
        document.documentElement.style.removeProperty("padding-right");
        document.documentElement.removeAttribute("data-scroll-locked");
      });

      toast({
        title: "Settings Saved!",
        description: "Your preferences have been updated.",
      });
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Save Failed",
        description: "Could not save settings.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addPostingTime = () => {
    if (newTime && !postingTimes.includes(newTime)) {
      setPostingTimes([...postingTimes, newTime].sort());
      setNewTime('');
    }
  };

  const removePostingTime = (time: string) => {
    setPostingTimes(postingTimes.filter(t => t !== time));
  };

  const handleResetStuckPosts = async () => {
    if (!userId) return;
    setIsResettingStuck(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .update({ status: 'Scheduled' })
        .eq('user_id', userId)
        .eq('status', 'processing')
        .select('id');

      if (error) throw error;

      const count = data?.length || 0;
      toast({
        title: "Stuck Posts Reset",
        description: count > 0 
          ? `${count} product(s) reset to 'Scheduled' status.`
          : "No stuck posts found.",
      });
    } catch (error) {
      console.error('Reset stuck posts error:', error);
      toast({
        title: "Reset Failed",
        description: "Could not reset stuck posts.",
        variant: "destructive",
      });
    } finally {
      setIsResettingStuck(false);
    }
  };

  const clearAccountForm = () => {
    setNewAccountName('');
    setNewAccountTelegramToken('');
    setNewAccountTelegramChatId('');
    setNewAccountGreenApiInstanceId('');
    setNewAccountGreenApiToken('');
    setNewAccountGreenApiChatId('');
  };

  const handleAddAccount = async () => {
    if (!userId || !newAccountName) {
      toast({ title: "נא להזין שם לחשבון", variant: "destructive" });
      return;
    }

    setIsSavingAccount(true);
    try {
      const { data, error } = await supabase
        .from('messaging_accounts')
        .insert({
          user_id: userId,
          account_type: showAddAccountDialog || 'telegram',
          account_name: newAccountName,
          is_active: true,
          telegram_chat_id: showAddAccountDialog === 'telegram' ? (newAccountTelegramChatId || null) : null,
          whatsapp_chat_id: showAddAccountDialog === 'whatsapp' ? (newAccountGreenApiChatId || null) : null,
        })
        .select('id, account_type, account_name, is_active, telegram_chat_id, whatsapp_chat_id')
        .single();

      if (error) throw error;

      // Save credentials to secure table via RPC for account
      if (showAddAccountDialog === 'telegram') {
        if (newAccountTelegramToken || newAccountTelegramChatId) {
          await supabase.rpc('update_account_credentials', {
            p_account_id: data.id,
            p_telegram_bot_token: newAccountTelegramToken || null,
            p_telegram_chat_id: newAccountTelegramChatId || null,
          });
        }
      } else {
        if (newAccountGreenApiToken || newAccountGreenApiInstanceId || newAccountGreenApiChatId) {
          await supabase.rpc('update_account_credentials', {
            p_account_id: data.id,
            p_greenapi_api_token: newAccountGreenApiToken || null,
            p_greenapi_instance_id: newAccountGreenApiInstanceId || null,
            p_greenapi_chat_id: newAccountGreenApiChatId || null,
          });
        }
      }

      // Also save to main credentials table for backward compatibility
      const credentialsToUpdate: Record<string, string | null> = {};
      if (showAddAccountDialog === 'telegram') {
        if (newAccountTelegramToken) credentialsToUpdate.p_telegram_bot_token = newAccountTelegramToken;
        if (newAccountTelegramChatId) credentialsToUpdate.p_telegram_chat_id = newAccountTelegramChatId;
      } else {
        if (newAccountGreenApiToken) credentialsToUpdate.p_greenapi_api_token = newAccountGreenApiToken;
        if (newAccountGreenApiInstanceId) credentialsToUpdate.p_greenapi_instance_id = newAccountGreenApiInstanceId;
        if (newAccountGreenApiChatId) credentialsToUpdate.p_greenapi_chat_id = newAccountGreenApiChatId;
      }

      if (Object.keys(credentialsToUpdate).length > 0) {
        await supabase.rpc('update_my_credentials', credentialsToUpdate);
        
        // Refresh credentials status
        const { data: credStatus } = await supabase.rpc('get_my_credentials_status');
        if (credStatus && typeof credStatus === 'object' && !Array.isArray(credStatus)) {
          setCredentialsStatus(credStatus as unknown as CredentialsStatus);
        }
      }

      setMessagingAccounts([...messagingAccounts, data]);
      setShowAddAccountDialog(null);
      clearAccountForm();

      toast({ title: "חשבון נוסף בהצלחה", description: `${newAccountName} נוסף לרשימה.` });
    } catch (error) {
      console.error('Add account error:', error);
      toast({ title: "Failed to add account", variant: "destructive" });
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleEditAccount = async () => {
    if (!editingAccount) return;

    setIsSavingAccount(true);
    try {
      // Update account name and chat IDs
      const updateData: Record<string, unknown> = {
        account_name: newAccountName || editingAccount.account_name,
      };

      if (editingAccount.account_type === 'telegram') {
        if (newAccountTelegramChatId) updateData.telegram_chat_id = newAccountTelegramChatId;
      } else {
        if (newAccountGreenApiChatId) updateData.whatsapp_chat_id = newAccountGreenApiChatId;
      }

      const { error } = await supabase
        .from('messaging_accounts')
        .update(updateData)
        .eq('id', editingAccount.id);

      if (error) throw error;

      // Update encrypted credentials via RPC
      if (editingAccount.account_type === 'telegram') {
        if (newAccountTelegramToken || newAccountTelegramChatId) {
          await supabase.rpc('update_account_credentials', {
            p_account_id: editingAccount.id,
            p_telegram_bot_token: newAccountTelegramToken || null,
            p_telegram_chat_id: newAccountTelegramChatId || null,
          });
        }
      } else {
        if (newAccountGreenApiToken || newAccountGreenApiInstanceId || newAccountGreenApiChatId) {
          await supabase.rpc('update_account_credentials', {
            p_account_id: editingAccount.id,
            p_greenapi_api_token: newAccountGreenApiToken || null,
            p_greenapi_instance_id: newAccountGreenApiInstanceId || null,
            p_greenapi_chat_id: newAccountGreenApiChatId || null,
          });
        }
      }

      // Also update main credentials for backward compatibility
      const credentialsToUpdate: Record<string, string | null> = {};
      if (editingAccount.account_type === 'telegram') {
        if (newAccountTelegramToken) credentialsToUpdate.p_telegram_bot_token = newAccountTelegramToken;
        if (newAccountTelegramChatId) credentialsToUpdate.p_telegram_chat_id = newAccountTelegramChatId;
      } else {
        if (newAccountGreenApiToken) credentialsToUpdate.p_greenapi_api_token = newAccountGreenApiToken;
        if (newAccountGreenApiInstanceId) credentialsToUpdate.p_greenapi_instance_id = newAccountGreenApiInstanceId;
        if (newAccountGreenApiChatId) credentialsToUpdate.p_greenapi_chat_id = newAccountGreenApiChatId;
      }

      if (Object.keys(credentialsToUpdate).length > 0) {
        await supabase.rpc('update_my_credentials', credentialsToUpdate);
        
        const { data: credStatus } = await supabase.rpc('get_my_credentials_status');
        if (credStatus && typeof credStatus === 'object' && !Array.isArray(credStatus)) {
          setCredentialsStatus(credStatus as unknown as CredentialsStatus);
        }
      }

      // Update local state
      setMessagingAccounts(accounts =>
        accounts.map(acc => acc.id === editingAccount.id 
          ? { 
              ...acc, 
              account_name: newAccountName || acc.account_name,
              telegram_chat_id: editingAccount.account_type === 'telegram' && newAccountTelegramChatId ? newAccountTelegramChatId : acc.telegram_chat_id,
              whatsapp_chat_id: editingAccount.account_type === 'whatsapp' && newAccountGreenApiChatId ? newAccountGreenApiChatId : acc.whatsapp_chat_id,
            } 
          : acc
        )
      );

      setEditingAccount(null);
      clearAccountForm();

      toast({ title: "חשבון עודכן בהצלחה" });
    } catch (error) {
      console.error('Edit account error:', error);
      toast({ title: "Failed to update account", variant: "destructive" });
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleToggleAccount = async (accountId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('messaging_accounts')
        .update({ is_active: isActive })
        .eq('id', accountId);

      if (error) throw error;

      setMessagingAccounts(accounts =>
        accounts.map(acc => acc.id === accountId ? { ...acc, is_active: isActive } : acc)
      );

      toast({ title: isActive ? "חשבון הופעל" : "חשבון הושבת" });
    } catch (error) {
      toast({ title: "Failed to update account", variant: "destructive" });
    }
  };

  const handleDeleteAccount = async (accountId: string) => {
    try {
      const { error } = await supabase
        .from('messaging_accounts')
        .delete()
        .eq('id', accountId);

      if (error) throw error;

      setMessagingAccounts(accounts => accounts.filter(acc => acc.id !== accountId));
      toast({ title: "חשבון נמחק" });
    } catch (error) {
      toast({ title: "Failed to delete account", variant: "destructive" });
    }
  };

  const openEditDialog = (account: MessagingAccount) => {
    setEditingAccount(account);
    setNewAccountName(account.account_name);
    if (account.account_type === 'telegram') {
      setNewAccountTelegramChatId(account.telegram_chat_id || '');
    } else {
      setNewAccountGreenApiChatId(account.whatsapp_chat_id || '');
    }
  };

  const handleSaveGoldPost = async () => {
    if (!userId) return;
    setIsSavingGoldPost(true);
    try {
      if (editingGoldPost) {
        const { error } = await supabase
          .from('gold_posts' as any)
          .update({
            message: goldMessage,
            media_url: goldMediaUrl || null,
            media_type: goldMediaType,
            send_time: goldSendTime,
            is_active: goldIsActive,
            target_account_ids: goldTargetAccounts,
          } as any)
          .eq('id', editingGoldPost.id);
        if (error) throw error;
        setGoldPosts(prev => prev.map(gp => gp.id === editingGoldPost.id ? {
          ...gp, message: goldMessage, media_url: goldMediaUrl || null, media_type: goldMediaType,
          send_time: goldSendTime, is_active: goldIsActive, target_account_ids: goldTargetAccounts,
        } : gp));
        toast({ title: "✅ פוסט זהב עודכן!" });
      } else {
        const { data, error } = await supabase
          .from('gold_posts' as any)
          .insert({
            user_id: userId,
            message: goldMessage,
            media_url: goldMediaUrl || null,
            media_type: goldMediaType,
            send_time: goldSendTime,
            is_active: goldIsActive,
            target_account_ids: goldTargetAccounts,
          } as any)
          .select('*')
          .single();
        if (error) throw error;
        setGoldPosts(prev => [data, ...prev]);
        toast({ title: "✅ פוסט זהב נוצר!" });
      }
      // Reset form
      setEditingGoldPost(null);
      setGoldMessage('');
      setGoldMediaUrl('');
      setGoldMediaType('image');
      setGoldSendTime('12:00');
      setGoldTargetAccounts([]);
      setGoldIsActive(true);
    } catch (error) {
      console.error('Save gold post error:', error);
      toast({ title: "שגיאה בשמירת פוסט זהב", variant: "destructive" });
    } finally {
      setIsSavingGoldPost(false);
    }
  };

  const handleDeleteGoldPost = async (id: string) => {
    try {
      const { error } = await supabase.from('gold_posts' as any).delete().eq('id', id);
      if (error) throw error;
      setGoldPosts(prev => prev.filter(gp => gp.id !== id));
      toast({ title: "פוסט זהב נמחק" });
    } catch {
      toast({ title: "שגיאה במחיקה", variant: "destructive" });
    }
  };

  const handleEditGoldPost = (gp: any) => {
    setEditingGoldPost(gp);
    setGoldMessage(gp.message || '');
    setGoldMediaUrl(gp.media_url || '');
    setGoldMediaType(gp.media_type || 'image');
    setGoldSendTime(gp.send_time || '12:00');
    setGoldTargetAccounts(gp.target_account_ids || []);
    setGoldIsActive(gp.is_active);
  };

  const handleGoldMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setIsUploadingGoldMedia(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${userId}/gold-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(path);
      setGoldMediaUrl(publicUrl);
      const isVideo = file.type.startsWith('video/');
      setGoldMediaType(isVideo ? 'video' : 'image');
      toast({ title: "מדיה הועלתה בהצלחה!" });
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: "שגיאה בהעלאת מדיה", variant: "destructive" });
    } finally {
      setIsUploadingGoldMedia(false);
    }
  };

  const toggleGoldTargetAccount = (accountId: string) => {
    setGoldTargetAccounts(prev =>
      prev.includes(accountId)
        ? prev.filter(id => id !== accountId)
        : [...prev, accountId]
    );
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const telegramAccounts = messagingAccounts.filter(a => a.account_type === 'telegram');
  const whatsappAccounts = messagingAccounts.filter(a => a.account_type === 'whatsapp');

  return (
    <MainLayout>
      <div className="space-y-8 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
            <SettingsIcon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              <span className="gradient-text">Settings</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure your automation preferences and API credentials
            </p>
          </div>
        </div>

        {/* Master Automation & Schedule */}
        <Card className="relative overflow-hidden">
          {automationEnabled && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-secondary to-primary animate-pulse" />
          )}
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className={`p-2 rounded-lg transition-all duration-300 ${automationEnabled ? 'bg-primary/30 shadow-[0_0_20px_rgba(var(--primary),0.5)]' : 'bg-muted'}`}>
                <Power className={`h-5 w-5 transition-colors ${automationEnabled ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              Automation Engine
              {automationEnabled && (
                <Badge className="bg-primary/20 text-primary border border-primary/30 animate-pulse">
                  <Zap className="h-3 w-3 mr-1" />
                  ACTIVE
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Master control for automated posting</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Master Switch */}
            <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-300 ${
              automationEnabled 
                ? 'bg-primary/10 border-primary/50 shadow-[0_0_30px_rgba(var(--primary),0.2)]' 
                : 'bg-muted/30 border-border'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${automationEnabled ? 'bg-primary/20' : 'bg-muted'}`}>
                  <Zap className={`h-5 w-5 ${automationEnabled ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Master Automation</p>
                  <p className="text-sm text-muted-foreground">
                    {automationEnabled 
                      ? "Auto-posting is ON - posts will be sent at scheduled times" 
                      : "Turn ON to automatically post from queue"}
                  </p>
                </div>
              </div>
              <Switch
                checked={automationEnabled}
                onCheckedChange={setAutomationEnabled}
                className={automationEnabled ? 'data-[state=checked]:bg-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]' : ''}
              />
            </div>

            {/* Start Publishing Button */}
            <Button
              onClick={handleStartPublishing}
              disabled={isStartingPublish}
              className="w-full h-14 text-lg font-bold bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl transition-all duration-300"
            >
              {isStartingPublish ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  מפרסם...
                </>
              ) : (
                <>
                  <Play className="h-5 w-5 mr-2" />
                  🚀 התחל לפרסם עכשיו
                </>
              )}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              לחיצה תפרסם מיידית את המוצר הראשון בתור ותפעיל פרסום כל {postingIntervalMinutes || 30} דקות בטווח {intervalStartTime}-{intervalEndTime}
            </p>

            {/* Interval vs Fixed Times Toggle */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Timer className="h-4 w-4" />
                Posting Mode
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setUseIntervalPosting(false)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    !useIntervalPosting
                      ? 'border-primary bg-primary/10 shadow-lg'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4" />
                    <span className="font-semibold text-foreground">שעות קבועות</span>
                  </div>
                  <p className="text-xs text-muted-foreground">שלח בשעות שהגדרת</p>
                </button>
                <button
                  type="button"
                  onClick={() => setUseIntervalPosting(true)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    useIntervalPosting
                      ? 'border-primary bg-primary/10 shadow-lg'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Timer className="h-4 w-4" />
                    <span className="font-semibold text-foreground">כל X שעות</span>
                  </div>
                  <p className="text-xs text-muted-foreground">שלח במרווחים קבועים</p>
                </button>
              </div>
            </div>

            {/* Interval Minutes Slider */}
            {useIntervalPosting && (
              <div className="space-y-4 p-4 rounded-lg border border-primary/30 bg-primary/5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">שלח כל</Label>
                  <Badge variant="outline" className="text-lg font-bold">
                    {postingIntervalMinutes && postingIntervalMinutes >= 60 
                      ? postingIntervalMinutes % 60 === 0 
                        ? `${postingIntervalMinutes / 60} שעות` 
                        : `${Math.floor(postingIntervalMinutes / 60)} שעות ו-${postingIntervalMinutes % 60} דקות`
                      : `${postingIntervalMinutes || 30} דקות`}
                  </Badge>
                </div>
                <Slider
                  value={[postingIntervalMinutes || 60]}
                  onValueChange={([val]) => setPostingIntervalMinutes(val)}
                  min={15}
                  max={720}
                  step={15}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>כל 15 דק'</span>
                  <span>כל 12 שעות</span>
                </div>

                {/* Time Range for Interval Posting */}
                <div className="pt-4 border-t border-primary/20">
                  <Label className="text-sm font-medium mb-3 block">טווח שעות לפרסום</Label>
                  <p className="text-xs text-muted-foreground mb-3">פרסם רק בין השעות הללו</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">משעה</Label>
                      <Input
                        type="time"
                        value={intervalStartTime}
                        onChange={(e) => setIntervalStartTime(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">עד שעה</Label>
                      <Input
                        type="time"
                        value={intervalEndTime}
                        onChange={(e) => setIntervalEndTime(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Separate Intervals Toggle */}
                <div className="pt-4 border-t border-primary/20">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <Label className="text-sm font-medium">הפרד בין וואטסאפ לטלגרם</Label>
                      <p className="text-xs text-muted-foreground">קבע מרווחי זמן שונים לכל ערוץ</p>
                    </div>
                    <Switch
                      checked={useSeparateIntervals}
                      onCheckedChange={setUseSeparateIntervals}
                    />
                  </div>
                  
                  {useSeparateIntervals && (
                    <div className="space-y-6 mt-4">
                      {/* WhatsApp Settings */}
                      <div className="p-4 rounded-lg bg-success/10 border border-success/30 space-y-4">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-success" />
                          <span className="font-medium text-success">וואטסאפ</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">שלח כל</Label>
                          <Badge variant="outline" className="font-bold border-success/50 text-success">
                            {whatsappIntervalMinutes && whatsappIntervalMinutes >= 60 
                              ? whatsappIntervalMinutes % 60 === 0 
                                ? `${whatsappIntervalMinutes / 60} שעות` 
                                : `${Math.floor(whatsappIntervalMinutes / 60)} שעות ו-${whatsappIntervalMinutes % 60} דקות`
                              : `${whatsappIntervalMinutes || 60} דקות`}
                          </Badge>
                        </div>
                        <Slider
                          value={[whatsappIntervalMinutes || 60]}
                          onValueChange={([val]) => setWhatsappIntervalMinutes(val)}
                          min={15}
                          max={720}
                          step={15}
                          className="w-full"
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">משעה</Label>
                            <Input
                              type="time"
                              value={whatsappIntervalStart}
                              onChange={(e) => setWhatsappIntervalStart(e.target.value)}
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">עד שעה</Label>
                            <Input
                              type="time"
                              value={whatsappIntervalEnd}
                              onChange={(e) => setWhatsappIntervalEnd(e.target.value)}
                              className="h-9"
                            />
                          </div>
                        </div>
                      </div>
                      
                      {/* Telegram Settings */}
                      <div className="p-4 rounded-lg bg-primary/10 border border-primary/30 space-y-4">
                        <div className="flex items-center gap-2">
                          <Send className="h-4 w-4 text-primary" />
                          <span className="font-medium text-primary">טלגרם</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">שלח כל</Label>
                          <Badge variant="outline" className="font-bold border-primary/50 text-primary">
                            {telegramIntervalMinutes && telegramIntervalMinutes >= 60 
                              ? telegramIntervalMinutes % 60 === 0 
                                ? `${telegramIntervalMinutes / 60} שעות` 
                                : `${Math.floor(telegramIntervalMinutes / 60)} שעות ו-${telegramIntervalMinutes % 60} דקות`
                              : `${telegramIntervalMinutes || 60} דקות`}
                          </Badge>
                        </div>
                        <Slider
                          value={[telegramIntervalMinutes || 60]}
                          onValueChange={([val]) => setTelegramIntervalMinutes(val)}
                          min={15}
                          max={720}
                          step={15}
                          className="w-full"
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">משעה</Label>
                            <Input
                              type="time"
                              value={telegramIntervalStart}
                              onChange={(e) => setTelegramIntervalStart(e.target.value)}
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">עד שעה</Label>
                            <Input
                              type="time"
                              value={telegramIntervalEnd}
                              onChange={(e) => setTelegramIntervalEnd(e.target.value)}
                              className="h-9"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Posting Times */}
            {!useIntervalPosting && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Posting Times</Label>
                <div className="flex flex-wrap gap-2">
                  {postingTimes.map((time) => (
                    <Badge
                      key={time}
                      variant="outline"
                      className={`px-3 py-1.5 text-sm transition-all ${
                        automationEnabled 
                          ? 'border-primary/50 text-primary bg-primary/10' 
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      <Clock className="h-3 w-3 mr-1" />
                      {time}
                      <button
                        onClick={() => removePostingTime(time)}
                        className="ml-2 hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Input
                      type="time"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                    />
                  </div>
                  <Button onClick={addPostingTime} variant="outline">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            )}

            {/* Shabbat Mode */}
            <div className="space-y-4">
              <div className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                shabbatModeEnabled 
                  ? 'bg-purple-500/10 border-purple-500/50' 
                  : 'bg-muted/30 border-border'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${shabbatModeEnabled ? 'bg-purple-500/20' : 'bg-muted'}`}>
                    <Moon className={`h-5 w-5 ${shabbatModeEnabled ? 'text-purple-500' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">מצב שבת 🕯️</p>
                    <p className="text-sm text-muted-foreground">עצור שליחה אוטומטית בשבת</p>
                  </div>
                </div>
                <Switch
                  checked={shabbatModeEnabled}
                  onCheckedChange={setShabbatModeEnabled}
                  className={shabbatModeEnabled ? 'data-[state=checked]:bg-purple-500' : ''}
                />
              </div>

              {shabbatModeEnabled && (
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg border border-purple-500/30 bg-purple-500/5">
                  <div className="space-y-2">
                    <Label className="text-sm">יום שישי - התחלה</Label>
                    <Input
                      type="time"
                      value={shabbatStartTime}
                      onChange={(e) => setShabbatStartTime(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">עצור שליחה מ-</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">מוצאי שבת - סיום</Label>
                    <Input
                      type="time"
                      value={shabbatEndTime}
                      onChange={(e) => setShabbatEndTime(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">המשך שליחה מ-</p>
                  </div>
                </div>
              )}
            </div>

            {/* Publishing Days */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Publishing Days
              </Label>
              <p className="text-xs text-muted-foreground">
                Select which days of the week automation should run
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { day: 0, nameEn: 'Sun', nameHe: "א'" },
                  { day: 1, nameEn: 'Mon', nameHe: "ב'" },
                  { day: 2, nameEn: 'Tue', nameHe: "ג'" },
                  { day: 3, nameEn: 'Wed', nameHe: "ד'" },
                  { day: 4, nameEn: 'Thu', nameHe: "ה'" },
                  { day: 5, nameEn: 'Fri', nameHe: "ו'" },
                  { day: 6, nameEn: 'Sat', nameHe: "ש'" },
                ].map(({ day, nameEn, nameHe }) => {
                  const isSelected = publishingDays.includes(day);
                  return (
                    <label
                      key={day}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-primary/10 border-primary/50 text-primary'
                          : 'bg-muted/30 border-border text-muted-foreground hover:border-primary/30'
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setPublishingDays([...publishingDays, day].sort());
                          } else {
                            setPublishingDays(publishingDays.filter(d => d !== day));
                          }
                        }}
                      />
                      <span className="text-sm font-medium">{nameHe}</span>
                      <span className="text-xs text-muted-foreground">({nameEn})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Reset Stuck Posts */}
            <div className="pt-4 border-t border-border">
              <Button
                variant="outline"
                onClick={handleResetStuckPosts}
                disabled={isResettingStuck}
                className="w-full"
              >
                {isResettingStuck ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-2" />
                )}
                Reset Stuck Posts
              </Button>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Reset products stuck in 'processing' status back to 'Scheduled'
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Telegram Accounts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-[#229ED9]/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#229ED9]" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                </svg>
              </div>
              קבוצות טלגרם
            </CardTitle>
            <CardDescription>
              הוסף וערוך קבוצות טלגרם לפרסום אוטומטי
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Global Telegram Credentials */}
            <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-4">
              <p className="text-sm font-medium text-foreground">הגדרות בסיסיות (משותף לכל הקבוצות)</p>
              <SecureCredentialInput
                label="Bot Token"
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                isConfigured={credentialsStatus.has_telegram_token}
                value={newTelegramBotToken}
                onUpdate={setNewTelegramBotToken}
              />
              <SecureCredentialInput
                label="Chat ID (ברירת מחדל)"
                placeholder="-1001234567890"
                isConfigured={credentialsStatus.has_telegram_chat_id}
                value={newTelegramChatId}
                onUpdate={setNewTelegramChatId}
              />
            </div>

            {/* Telegram Accounts List */}
            {telegramAccounts.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">קבוצות טלגרם</Label>
                {telegramAccounts.map((account) => (
                  <div
                    key={account.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                      account.is_active ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <MessageSquare className={`h-4 w-4 ${account.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="font-medium text-sm">{account.account_name}</p>
                        {account.telegram_chat_id && (
                          <p className="text-xs text-muted-foreground">Chat ID: {account.telegram_chat_id}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={account.is_active}
                        onCheckedChange={(checked) => handleToggleAccount(account.id, checked)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(account)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteAccount(account.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Telegram Account Button */}
            <Dialog open={showAddAccountDialog === 'telegram'} onOpenChange={(open) => {
              if (!open) {
                setShowAddAccountDialog(null);
                clearAccountForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowAddAccountDialog('telegram')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  הוסף קבוצת טלגרם
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>הוסף קבוצת טלגרם חדשה</DialogTitle>
                  <DialogDescription>
                    הזן את פרטי הקבוצה. הנתונים מאובטחים ומוצפנים.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>שם הקבוצה</Label>
                    <Input
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      placeholder="למשל: קבוצת מבצעים"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bot Token (אופציונלי - ישתמש בברירת מחדל)</Label>
                    <Input
                      type="password"
                      value={newAccountTelegramToken}
                      onChange={(e) => setNewAccountTelegramToken(e.target.value)}
                      placeholder="השאר ריק לשימוש בטוקן הראשי"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Chat ID</Label>
                    <Input
                      value={newAccountTelegramChatId}
                      onChange={(e) => setNewAccountTelegramChatId(e.target.value)}
                      placeholder="-1001234567890"
                    />
                  </div>
                  <Button 
                    onClick={handleAddAccount} 
                    className="w-full"
                    disabled={isSavingAccount || !newAccountName}
                  >
                    {isSavingAccount ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    הוסף קבוצה
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* WhatsApp Accounts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-[#25D366]/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#25D366]" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              קבוצות וואטסאפ (GreenAPI)
            </CardTitle>
            <CardDescription>
              הוסף וערוך קבוצות וואטסאפ לפרסום אוטומטי
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Global WhatsApp Credentials */}
            <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-4">
              <p className="text-sm font-medium text-foreground">הגדרות בסיסיות (משותף לכל הקבוצות)</p>
              <SecureCredentialInput
                label="Instance ID"
                placeholder="1234567890"
                isConfigured={credentialsStatus.has_greenapi_instance}
                value={newGreenApiInstance}
                onUpdate={setNewGreenApiInstance}
              />
              <SecureCredentialInput
                label="API Token"
                placeholder="your-api-token-here"
                isConfigured={credentialsStatus.has_greenapi_token}
                value={newGreenApiToken}
                onUpdate={setNewGreenApiToken}
              />
              <SecureCredentialInput
                label="Chat ID (ברירת מחדל)"
                placeholder="972501234567"
                isConfigured={credentialsStatus.has_greenapi_chat_id}
                value={newGreenApiChatId}
                onUpdate={setNewGreenApiChatId}
              />
            </div>

            {/* WhatsApp Accounts List */}
            {whatsappAccounts.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">קבוצות וואטסאפ</Label>
                {whatsappAccounts.map((account) => (
                  <div
                    key={account.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                      account.is_active ? 'border-[#25D366]/50 bg-[#25D366]/5' : 'border-border bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <MessageSquare className={`h-4 w-4 ${account.is_active ? 'text-[#25D366]' : 'text-muted-foreground'}`} />
                      <div>
                        <p className="font-medium text-sm">{account.account_name}</p>
                        {account.whatsapp_chat_id && (
                          <p className="text-xs text-muted-foreground">Chat ID: {account.whatsapp_chat_id}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={account.is_active}
                        onCheckedChange={(checked) => handleToggleAccount(account.id, checked)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(account)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteAccount(account.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add WhatsApp Account Button */}
            <Dialog open={showAddAccountDialog === 'whatsapp'} onOpenChange={(open) => {
              if (!open) {
                setShowAddAccountDialog(null);
                clearAccountForm();
              }
            }}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowAddAccountDialog('whatsapp')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  הוסף קבוצת וואטסאפ
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>הוסף קבוצת וואטסאפ חדשה</DialogTitle>
                  <DialogDescription>
                    הזן את פרטי הקבוצה. הנתונים מאובטחים ומוצפנים.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>שם הקבוצה</Label>
                    <Input
                      value={newAccountName}
                      onChange={(e) => setNewAccountName(e.target.value)}
                      placeholder="למשל: קבוצת דילים"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Instance ID (אופציונלי)</Label>
                    <Input
                      value={newAccountGreenApiInstanceId}
                      onChange={(e) => setNewAccountGreenApiInstanceId(e.target.value)}
                      placeholder="השאר ריק לשימוש בברירת מחדל"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>API Token (אופציונלי)</Label>
                    <Input
                      type="password"
                      value={newAccountGreenApiToken}
                      onChange={(e) => setNewAccountGreenApiToken(e.target.value)}
                      placeholder="השאר ריק לשימוש בברירת מחדל"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Chat ID</Label>
                    <Input
                      value={newAccountGreenApiChatId}
                      onChange={(e) => setNewAccountGreenApiChatId(e.target.value)}
                      placeholder="972501234567@g.us"
                    />
                  </div>
                  <Button 
                    onClick={handleAddAccount} 
                    className="w-full"
                    disabled={isSavingAccount || !newAccountName}
                  >
                    {isSavingAccount ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    הוסף קבוצה
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Edit Account Dialog */}
        <Dialog open={!!editingAccount} onOpenChange={(open) => {
          if (!open) {
            setEditingAccount(null);
            clearAccountForm();
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>ערוך {editingAccount?.account_type === 'telegram' ? 'קבוצת טלגרם' : 'קבוצת וואטסאפ'}</DialogTitle>
              <DialogDescription>
                עדכן את פרטי הקבוצה. הנתונים מאובטחים ומוצפנים.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>שם הקבוצה</Label>
                <Input
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder={editingAccount?.account_name}
                />
              </div>
              
              {editingAccount?.account_type === 'telegram' ? (
                <>
                  <div className="space-y-2">
                    <Label>Bot Token (השאר ריק לשמירת הקיים)</Label>
                    <Input
                      type="password"
                      value={newAccountTelegramToken}
                      onChange={(e) => setNewAccountTelegramToken(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Chat ID</Label>
                    <Input
                      value={newAccountTelegramChatId}
                      onChange={(e) => setNewAccountTelegramChatId(e.target.value)}
                      placeholder={editingAccount?.telegram_chat_id || "-1001234567890"}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Instance ID (השאר ריק לשמירת הקיים)</Label>
                    <Input
                      value={newAccountGreenApiInstanceId}
                      onChange={(e) => setNewAccountGreenApiInstanceId(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>API Token (השאר ריק לשמירת הקיים)</Label>
                    <Input
                      type="password"
                      value={newAccountGreenApiToken}
                      onChange={(e) => setNewAccountGreenApiToken(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Chat ID</Label>
                    <Input
                      value={newAccountGreenApiChatId}
                      onChange={(e) => setNewAccountGreenApiChatId(e.target.value)}
                      placeholder={editingAccount?.whatsapp_chat_id || "972501234567@g.us"}
                    />
                  </div>
                </>
              )}
              
              <Button 
                onClick={handleEditAccount} 
                className="w-full"
                disabled={isSavingAccount}
              >
                {isSavingAccount ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                שמור שינויים
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* AliExpress API */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-orange-500" />
              AliExpress Affiliate API
            </CardTitle>
            <CardDescription>
              Configure your AliExpress API credentials for generating affiliate links (stored securely)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SecureCredentialInput
              label="App Key"
              placeholder="Enter your AliExpress App Key"
              isConfigured={credentialsStatus.has_aliexpress_key}
              value={newAliexpressKey}
              onUpdate={setNewAliexpressKey}
            />
            <SecureCredentialInput
              label="App Secret"
              placeholder="Enter your AliExpress App Secret"
              isConfigured={credentialsStatus.has_aliexpress_secret}
              value={newAliexpressSecret}
              onUpdate={setNewAliexpressSecret}
            />
            <div className="space-y-2">
              <Label className="text-sm font-medium">Tracking ID</Label>
              <p className="text-xs text-muted-foreground">This is not a secret and can be displayed</p>
              <Input
                value={aliexpressTrackingId}
                onChange={(e) => setAliexpressTrackingId(e.target.value)}
                placeholder="Enter your Tracking ID (e.g., TELEGRAM)"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">שער דולר (₪)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fetchBankIsraelRate}
                  disabled={isFetchingRate}
                >
                  {isFetchingRate ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  עדכון מבנק ישראל
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">שער חליפין להמרת מחירים מדולר לשקל</p>
              <Input
                type="number"
                step="0.01"
                value={usdExchangeRate}
                onChange={(e) => setUsdExchangeRate(parseFloat(e.target.value) || 3.7)}
                placeholder="3.7"
                className="w-32"
              />
            </div>
            
            {/* Dedicated API Save Button */}
            <Button
              onClick={async () => {
                if (!newAliexpressKey && !newAliexpressSecret) {
                  toast({
                    title: "אין מה לשמור",
                    description: "הכנס App Key או App Secret חדש לפני שמירה",
                    variant: "destructive",
                  });
                  return;
                }
                setIsSavingApi(true);
                try {
                  const credentialsToUpdate: Record<string, string | null> = {};
                  if (newAliexpressKey) credentialsToUpdate.p_aliexpress_app_key = newAliexpressKey;
                  if (newAliexpressSecret) credentialsToUpdate.p_aliexpress_app_secret = newAliexpressSecret;
                  
                  const { error: credError } = await supabase.rpc('update_my_credentials', credentialsToUpdate);
                  if (credError) throw credError;
                  
                  // Clear input fields
                  setNewAliexpressKey('');
                  setNewAliexpressSecret('');
                  
                  // Refresh credentials status
                  const { data: credStatus } = await supabase.rpc('get_my_credentials_status');
                  if (credStatus && typeof credStatus === 'object' && !Array.isArray(credStatus)) {
                    setCredentialsStatus(credStatus as unknown as CredentialsStatus);
                  }
                  
                  toast({
                    title: "API נשמר בהצלחה! 🔐",
                    description: "המפתחות הוצפנו ונשמרו בצורה מאובטחת.",
                  });
                } catch (error) {
                  console.error('Save API error:', error);
                  toast({
                    title: "שגיאה בשמירת API",
                    description: "לא ניתן לשמור את המפתחות. נסה שוב.",
                    variant: "destructive",
                  });
                } finally {
                  setIsSavingApi(false);
                }
              }}
              disabled={isSavingApi || (!newAliexpressKey && !newAliexpressSecret)}
              variant="outline"
              className="w-full border-orange-500/50 text-orange-600 hover:bg-orange-50"
            >
              {isSavingApi ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              שמור API מוצפן
            </Button>
          </CardContent>
        </Card>

        {/* AI API Keys (OpenAI + Gemini) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              מפתחות AI לניסוח מחדש
            </CardTitle>
            <CardDescription>
              הגדר מפתח OpenAI ו/או Gemini לניסוח מחדש של פוסטים. ניתן להשתמש בשניהם או באחד.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                OpenAI API Key
                {openaiApiKey && <Badge variant="outline" className="text-xs text-green-600 border-green-500/30">מוגדר ✓</Badge>}
              </Label>
              <Input
                type="password"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="sk-..."
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                ניתן ליצור מפתח ב-<a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">platform.openai.com</a>
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                Gemini API Key
                {geminiApiKey && <Badge variant="outline" className="text-xs text-blue-600 border-blue-500/30">מוגדר ✓</Badge>}
              </Label>
              <Input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                placeholder="AIza..."
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground">
                ניתן ליצור מפתח ב-<a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline">aistudio.google.com</a>
              </p>
            </div>
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Prompt Templates
            </CardTitle>
            <CardDescription>
              הפרומפט הקבוע שמשמש ליצירת תיאורים בעברית. ניתן לערוך אם רוצים שינויים.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Default prompt button */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">פרומפט נוכחי</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCustomAiPrompt(DEFAULT_PROMPT)}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  אפס לברירת מחדל
                </Button>
              </div>
            </div>

            <Textarea
              value={customAiPrompt || DEFAULT_PROMPT}
              onChange={(e) => setCustomAiPrompt(e.target.value)}
              className="min-h-[250px] font-mono text-sm"
              dir="rtl"
            />
            <div className="bg-muted/50 p-3 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground" dir="rtl">
                💡 <strong>טיפ:</strong> הקישור והמחיר יתווספו אוטומטית בסוף הפוסט
              </p>
            </div>

            {/* AI Rewrite Template Section */}
            <div className="pt-6 border-t border-border">
              <div className="flex items-center justify-between mb-3">
                <div className="space-y-1">
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    AI Rewrite Template
                  </Label>
                  <p className="text-xs text-muted-foreground" dir="rtl">
                    טמפלייט לכתיבה מחדש בסגנון טלגרם ישראלי
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAiRewriteTemplate(DEFAULT_AI_REWRITE_TEMPLATE)}
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  אפס לברירת מחדל
                </Button>
              </div>
              
              <Textarea
                value={aiRewriteTemplate || DEFAULT_AI_REWRITE_TEMPLATE}
                onChange={(e) => setAiRewriteTemplate(e.target.value)}
                className="min-h-[250px] font-mono text-sm"
                dir="rtl"
              />
              <div className="bg-gradient-to-r from-purple-500/10 to-primary/10 p-3 rounded-lg border border-purple-500/20 mt-3">
                <p className="text-xs text-muted-foreground" dir="rtl">
                  ✨ <strong>AI Rewrite</strong> כותב את התוכן מחדש בסגנון טבעי כמו עורך תוכן אנושי - לא תרגום מילולי
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custom Emoji Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Telegram Custom Emoji
            </CardTitle>
            <CardDescription dir="rtl">
              החלפת אימוג'י רגילים באימוג'י מונפשים (Telegram Premium) בעת שליחת פוסטים
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">השתמש באימוג'י מונפשים</span>
              </div>
              <Switch
                checked={useCustomEmoji}
                onCheckedChange={setUseCustomEmoji}
              />
            </div>

            {useCustomEmoji && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">מיפוי אימוג'י</Label>
                
                {/* Existing mappings */}
                {emojiMappings.map((mapping) => (
                  <div key={mapping.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border">
                    <span className="text-2xl w-10 text-center">{mapping.emoji}</span>
                    <span className="text-xs text-muted-foreground flex-1 font-mono truncate">{mapping.custom_emoji_id}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await supabase.from('custom_emoji_mappings').delete().eq('id', mapping.id);
                        setEmojiMappings(prev => prev.filter(m => m.id !== mapping.id));
                        toast({ title: "אימוג'י נמחק" });
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}

                {/* Add new mapping */}
                <div className="flex items-center gap-2">
                  <Input
                    value={newEmoji}
                    onChange={(e) => setNewEmoji(e.target.value)}
                    placeholder="🔥"
                    className="w-16 text-center text-lg"
                    maxLength={4}
                  />
                  <Input
                    value={newEmojiId}
                    onChange={(e) => setNewEmojiId(e.target.value)}
                    placeholder="Custom Emoji ID"
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!newEmoji || !newEmojiId || !userId}
                    onClick={async () => {
                      if (!userId) return;
                      const { data, error } = await supabase
                        .from('custom_emoji_mappings')
                        .upsert({ user_id: userId, emoji: newEmoji, custom_emoji_id: newEmojiId }, { onConflict: 'user_id,emoji' })
                        .select('id, emoji, custom_emoji_id')
                        .single();
                      if (error) {
                        toast({ title: "שגיאה בהוספת אימוג'י", variant: "destructive" });
                        return;
                      }
                      setEmojiMappings(prev => {
                        const existing = prev.findIndex(m => m.emoji === newEmoji);
                        if (existing >= 0) {
                          const updated = [...prev];
                          updated[existing] = data;
                          return updated;
                        }
                        return [...prev, data];
                      });
                      setNewEmoji('');
                      setNewEmojiId('');
                      toast({ title: "אימוג'י נוסף!" });
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <div className="bg-muted/50 p-3 rounded-lg border text-xs text-muted-foreground" dir="rtl">
                  💡 ניתן למצוא Custom Emoji ID דרך בוט @GetCustomEmojiBot בטלגרם
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gold Post Section */}
        <Card className="relative overflow-hidden border-amber-500/30">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-400" />
          <CardHeader>
            <CardTitle className="flex items-center gap-2" dir="rtl">
              <div className="p-2 rounded-lg bg-amber-500/20">
                <Sparkles className="h-5 w-5 text-amber-500" />
              </div>
              ⭐ פוסט זהב
            </CardTitle>
            <CardDescription dir="rtl">פוסט קבוע שנשלח פעם ביום בשעה שתבחר - ללא קשר לתור</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4" dir="rtl">
            {/* Existing gold posts */}
            {goldPosts.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">פוסטים קיימים</Label>
                {goldPosts.map(gp => (
                  <div key={gp.id} className={`p-3 rounded-lg border flex items-start justify-between gap-2 ${gp.is_active ? 'bg-amber-500/5 border-amber-500/30' : 'bg-muted/30 border-border opacity-60'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-amber-600 border-amber-600/50">
                          <Clock className="h-3 w-3 mr-1" />
                          {gp.send_time}
                        </Badge>
                        {gp.is_active ? (
                          <Badge className="bg-primary/20 text-primary text-xs">פעיל</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">מושבת</Badge>
                        )}
                        {gp.last_sent_date && (
                          <span className="text-xs text-muted-foreground">נשלח: {gp.last_sent_date}</span>
                        )}
                      </div>
                      <p className="text-sm mt-1 line-clamp-2 text-foreground">{gp.message?.substring(0, 100)}{gp.message?.length > 100 ? '...' : ''}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditGoldPost(gp)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteGoldPost(gp.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Gold post form */}
            <div className="space-y-4 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <Label className="font-semibold text-foreground">{editingGoldPost ? '✏️ עריכת פוסט זהב' : '➕ פוסט זהב חדש'}</Label>

              <div className="space-y-2">
                <Label className="text-sm">תוכן ההודעה</Label>
                <Textarea
                  value={goldMessage}
                  onChange={(e) => setGoldMessage(e.target.value)}
                  placeholder="כתוב את תוכן הפוסט כאן..."
                  className="min-h-[100px] text-right"
                  dir="rtl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm">שעת שליחה</Label>
                  <Input
                    type="time"
                    value={goldSendTime}
                    onChange={(e) => setGoldSendTime(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">סטטוס</Label>
                  <div className="flex items-center gap-2 h-10">
                    <Switch checked={goldIsActive} onCheckedChange={setGoldIsActive} />
                    <span className="text-sm">{goldIsActive ? 'פעיל' : 'מושבת'}</span>
                  </div>
                </div>
              </div>

              {/* Media */}
              <div className="space-y-2">
                <Label className="text-sm">מדיה (תמונה או וידאו)</Label>
                <div className="flex gap-2">
                  <Input
                    value={goldMediaUrl}
                    onChange={(e) => setGoldMediaUrl(e.target.value)}
                    placeholder="URL של תמונה/וידאו או העלה קובץ"
                    className="flex-1"
                    dir="ltr"
                  />
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*,video/*" className="hidden" onChange={handleGoldMediaUpload} />
                    <Button type="button" variant="outline" size="sm" className="h-10" disabled={isUploadingGoldMedia} asChild>
                      <span>
                        {isUploadingGoldMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </span>
                    </Button>
                  </label>
                </div>
                {goldMediaUrl && (
                  <div className="flex items-center gap-2">
                    {goldMediaType === 'video' ? (
                      <Badge variant="outline">🎬 וידאו</Badge>
                    ) : (
                      <img src={goldMediaUrl} alt="" className="h-16 w-16 object-cover rounded" />
                    )}
                    <Button variant="ghost" size="sm" onClick={() => { setGoldMediaUrl(''); setGoldMediaType('image'); }}>
                      <X className="h-3 w-3 mr-1" /> הסר
                    </Button>
                  </div>
                )}
              </div>

              {/* Target accounts */}
              <div className="space-y-2">
                <Label className="text-sm">חשבונות יעד</Label>
                <div className="space-y-1">
                  {messagingAccounts.map(acc => (
                    <label key={acc.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer">
                      <Checkbox
                        checked={goldTargetAccounts.includes(acc.id)}
                        onCheckedChange={() => toggleGoldTargetAccount(acc.id)}
                      />
                      <span className="text-sm">
                        {acc.account_type === 'telegram' ? '📱' : '💬'} {acc.account_name}
                      </span>
                      {!acc.is_active && <Badge variant="secondary" className="text-xs">לא פעיל</Badge>}
                    </label>
                  ))}
                  {messagingAccounts.length === 0 && (
                    <p className="text-sm text-muted-foreground">אין חשבונות - הוסף חשבון קודם</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSaveGoldPost}
                  disabled={isSavingGoldPost || !goldMessage.trim() || goldTargetAccounts.length === 0}
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                >
                  {isSavingGoldPost ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  {editingGoldPost ? 'עדכן פוסט זהב' : 'שמור פוסט זהב'}
                </Button>
                {editingGoldPost && (
                  <Button variant="ghost" onClick={() => {
                    setEditingGoldPost(null);
                    setGoldMessage('');
                    setGoldMediaUrl('');
                    setGoldMediaType('image');
                    setGoldSendTime('12:00');
                    setGoldTargetAccounts([]);
                    setGoldIsActive(true);
                  }}>
                    ביטול
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleSave}
          disabled={isSaving}
          variant="gradient"
          size="lg"
          className="w-full"
        >
          {isSaving ? (
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
          ) : (
            <Save className="h-5 w-5 mr-2" />
          )}
          Save All Settings
        </Button>
      </div>
    </MainLayout>
  );
};

export default Settings;
