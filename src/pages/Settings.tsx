import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { 
  Settings as SettingsIcon, 
  Clock, 
  Save, 
  Loader2, 
  Plus, 
  X, 
  Eye, 
  EyeOff,
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
  AlertCircle
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
          <div className="relative">
            <Input
              type="password"
              value={value}
              onChange={(e) => onUpdate(e.target.value)}
              placeholder={placeholder}
              className="pr-10"
            />
          </div>
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
          <Eye className="h-4 w-4 mr-2" />
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
}

interface AutomationLogRow {
  id: string;
  created_at: string;
  level: string;
  message: string;
  context: any;
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

// Pre-defined prompt templates - description only, no prices/coupons/links
const PROMPT_TEMPLATES: Record<string, { name: string; nameHe: string; icon: string; prompt: string }> = {
  sales: {
    name: 'Sales',
    nameHe: 'מכירתי',
    icon: '💰',
    prompt: `אתה משווק שותפים ישראלי. כתוב תיאור מוצר מכירתי בעברית.

מבנה חובה:
1. כותרת: [אימוג'י מתאים] *[שם המוצר באנגלית/מותג]* – [תכונה עיקרית בעברית]
2. תיאור מכירתי: 2-3 שורות שמסבירים למה זה מוצר מעולה ולמה כדאי לקנות
3. נתונים: ⭐ [דירוג] | [הזמנות] הזמנות (רק אם יש מידע מה-API)

כללים:
- שם המוצר/מותג באנגלית, כל השאר בעברית
- אסור להוסיף מחיר או קופון - יתווסף אוטומטית
- אסור להוסיף קישור`
  },
  personal: {
    name: 'Personal',
    nameHe: 'אישי',
    icon: '💬',
    prompt: `אתה חבר שממליץ על מוצר טוב. כתוב תיאור אישי וחברי בעברית.

מבנה חובה:
1. פתיחה אישית: "מצאתי משהו מגניב" או "חייב לשתף אתכם"
2. תיאור: 2-3 שורות בטון של שיחה עם חברים, למה אתה ממליץ
3. נתונים: ⭐ [דירוג] | [הזמנות] הזמנות (רק אם יש)

כללים:
- שם המוצר/מותג באנגלית, כל השאר בעברית
- אסור להוסיף מחיר או קופון - יתווסף אוטומטית
- אסור להוסיף קישור`
  },
  urgent: {
    name: 'Urgent',
    nameHe: 'דחוף',
    icon: '🔥',
    prompt: `אתה משווק שותפים. כתוב תיאור מוצר דחוף עם תחושת מיידיות בעברית.

מבנה חובה:
1. כותרת: 🔥 *[שם המוצר באנגלית]*
2. תיאור דחוף: 2 שורות שמדגישות למה לקנות עכשיו
3. נתונים: ⭐ [דירוג] | [הזמנות] הזמנות
4. סיום: ⚡ מלאי מוגבל

כללים:
- שם המוצר/מותג באנגלית, כל השאר בעברית
- אסור להוסיף מחיר או קופון - יתווסף אוטומטית
- אסור להוסיף קישור`
  },
  professional: {
    name: 'Professional',
    nameHe: 'מקצועי',
    icon: '📋',
    prompt: `אתה כותב תוכן מקצועי. כתוב תיאור מוצר מפורט ומקצועי בעברית.

מבנה חובה:
1. כותרת: *[שם המוצר המלא באנגלית]*
2. תיאור מקצועי: 3 שורות עם מידע ומפרט על המוצר
3. נתונים: ⭐ [דירוג] | [הזמנות] הזמנות

כללים:
- שם המוצר/מותג באנגלית, כל השאר בעברית
- אסור להוסיף מחיר או קופון - יתווסף אוטומטית
- אסור להוסיף קישור`
  }
};

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
  
  // Interval posting (new)
  const [postingIntervalHours, setPostingIntervalHours] = useState<number | null>(null);
  const [useIntervalPosting, setUseIntervalPosting] = useState(false);
  
  // Shabbat mode (new)
  const [shabbatModeEnabled, setShabbatModeEnabled] = useState(false);
  const [shabbatStartTime, setShabbatStartTime] = useState('14:00');
  const [shabbatEndTime, setShabbatEndTime] = useState('20:00');
  
  // Publishing days (0=Sunday, 6=Saturday)
  const [publishingDays, setPublishingDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  // AliExpress tracking ID (non-sensitive)
  const [aliexpressTrackingId, setAliexpressTrackingId] = useState('');

  // Custom AI prompt
  const [customAiPrompt, setCustomAiPrompt] = useState('');
  const [selectedPromptType, setSelectedPromptType] = useState<string | null>(null);

  // Multi-account management (simplified - no sensitive data)
  const [messagingAccounts, setMessagingAccounts] = useState<MessagingAccount[]>([]);
  const [showAddAccount, setShowAddAccount] = useState<'telegram' | 'whatsapp' | null>(null);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountTelegramToken, setNewAccountTelegramToken] = useState('');
  const [newAccountTelegramChatId, setNewAccountTelegramChatId] = useState('');
  const [newAccountGreenApiInstanceId, setNewAccountGreenApiInstanceId] = useState('');
  const [newAccountGreenApiToken, setNewAccountGreenApiToken] = useState('');
  const [newAccountGreenApiChatId, setNewAccountGreenApiChatId] = useState('');

  // System logs
  const [systemLogs, setSystemLogs] = useState<AutomationLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [isResettingStuck, setIsResettingStuck] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSystemLogs = async (uid: string) => {
    setLogsLoading(true);
    try {
      const { data, error } = await supabase
        .from('automation_logs')
        .select('id, created_at, level, message, context')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setSystemLogs((data as any) || []);
    } catch (error) {
      console.error('Error fetching system logs:', error);
      toast({
        title: 'Failed to load logs',
        description: 'Could not load server logs.',
        variant: 'destructive',
      });
    } finally {
      setLogsLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      setUserId(user.id);

      // Fetch app settings (non-sensitive data only)
      const { data, error } = await supabase
        .from('app_settings')
        .select('id, automation_enabled, posting_times, publishing_days, aliexpress_tracking_id, custom_ai_prompt, posting_interval_hours, shabbat_mode_enabled, shabbat_start_time, shabbat_end_time, telegram_enabled, whatsapp_enabled, telegram_chat_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettingsId(data.id);
        setAutomationEnabled(data.automation_enabled || false);
        setPostingTimes(data.posting_times || ['10:00', '14:00', '20:00']);
        setPublishingDays(data.publishing_days || [0, 1, 2, 3, 4, 5, 6]);
        setAliexpressTrackingId(data.aliexpress_tracking_id || '');
        setCustomAiPrompt(data.custom_ai_prompt || '');
        
        // New settings
        setPostingIntervalHours(data.posting_interval_hours || null);
        setUseIntervalPosting(!!data.posting_interval_hours);
        setShabbatModeEnabled(data.shabbat_mode_enabled || false);
        setShabbatStartTime(data.shabbat_start_time || '14:00');
        setShabbatEndTime(data.shabbat_end_time || '20:00');
        
        // Detect which prompt template is selected
        if (data.custom_ai_prompt) {
          const matchedTemplate = Object.entries(PROMPT_TEMPLATES).find(
            ([_, template]) => template.prompt === data.custom_ai_prompt
          );
          if (matchedTemplate) {
            setSelectedPromptType(matchedTemplate[0]);
          }
        }
      }

      // Fetch credentials status (boolean flags only - never actual values)
      const { data: credStatus, error: credError } = await supabase.rpc('get_my_credentials_status');
      
      if (!credError && credStatus && typeof credStatus === 'object' && !Array.isArray(credStatus)) {
        setCredentialsStatus(credStatus as unknown as CredentialsStatus);
      }

      // Fetch messaging accounts (limited data - no tokens)
      const { data: accounts, error: accountsErr } = await supabase
        .from('messaging_accounts')
        .select('id, account_type, account_name, is_active, telegram_chat_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (accountsErr) throw accountsErr;
      setMessagingAccounts(accounts || []);

      // Fetch system logs
      await fetchSystemLogs(user.id);

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
      // Update app_settings (non-sensitive settings)
      const updateData: any = {
        automation_enabled: automationEnabled,
        posting_times: postingTimes,
        publishing_days: publishingDays,
        aliexpress_tracking_id: aliexpressTrackingId || null,
        custom_ai_prompt: customAiPrompt || null,
        posting_interval_hours: useIntervalPosting ? postingIntervalHours : null,
        shabbat_mode_enabled: shabbatModeEnabled,
        shabbat_start_time: shabbatStartTime,
        shabbat_end_time: shabbatEndTime,
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
        
        // Clear the input fields after save
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

  const handleAddAccount = async () => {
    if (!userId || !newAccountName) return;

    try {
      const accountData: any = {
        user_id: userId,
        account_type: showAddAccount,
        account_name: newAccountName,
        is_active: true,
      };

      // Store chat ID in messaging_accounts (non-sensitive reference)
      if (showAddAccount === 'telegram') {
        accountData.telegram_chat_id = newAccountTelegramChatId;
      }

      const { data, error } = await supabase
        .from('messaging_accounts')
        .insert(accountData)
        .select()
        .single();

      if (error) throw error;

      // Save credentials to secure table via RPC
      const credentialsToUpdate: Record<string, string | null> = {};
      
      if (showAddAccount === 'telegram') {
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
      setShowAddAccount(null);
      setNewAccountName('');
      setNewAccountTelegramToken('');
      setNewAccountTelegramChatId('');
      setNewAccountGreenApiInstanceId('');
      setNewAccountGreenApiToken('');
      setNewAccountGreenApiChatId('');

      toast({ title: "Account Added", description: `${newAccountName} has been added.` });
    } catch (error) {
      console.error('Add account error:', error);
      toast({ title: "Failed to add account", variant: "destructive" });
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

      toast({ title: isActive ? "Account Activated" : "Account Deactivated" });
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
      toast({ title: "Account Deleted" });
    } catch (error) {
      toast({ title: "Failed to delete account", variant: "destructive" });
    }
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
            <CardDescription>
              Master control for automated posting
            </CardDescription>
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

            {/* Interval Hours Slider (if interval mode) */}
            {useIntervalPosting && (
              <div className="space-y-4 p-4 rounded-lg border border-primary/30 bg-primary/5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">שלח כל</Label>
                  <Badge variant="outline" className="text-lg font-bold">
                    {postingIntervalHours || 2} שעות
                  </Badge>
                </div>
                <Slider
                  value={[postingIntervalHours || 2]}
                  onValueChange={([val]) => setPostingIntervalHours(val)}
                  min={1}
                  max={12}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>כל שעה</span>
                  <span>כל 12 שעות</span>
                </div>
              </div>
            )}

            {/* Posting Times (if fixed times mode) */}
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
                    <p className="text-sm text-muted-foreground">
                      עצור שליחה אוטומטית בשבת
                    </p>
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

        {/* Telegram Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-[#229ED9]/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#229ED9]" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                </svg>
              </div>
              Telegram Configuration
            </CardTitle>
            <CardDescription>
              Configure your Telegram bot credentials (stored securely, never sent to browser)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SecureCredentialInput
              label="Bot Token"
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              isConfigured={credentialsStatus.has_telegram_token}
              value={newTelegramBotToken}
              onUpdate={setNewTelegramBotToken}
            />
            <SecureCredentialInput
              label="Chat ID"
              placeholder="-1001234567890"
              isConfigured={credentialsStatus.has_telegram_chat_id}
              value={newTelegramChatId}
              onUpdate={setNewTelegramChatId}
            />
          </CardContent>
        </Card>

        {/* WhatsApp Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-[#25D366]/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#25D366]" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              WhatsApp Configuration (GreenAPI)
            </CardTitle>
            <CardDescription>
              Configure your WhatsApp credentials (stored securely, never sent to browser)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
              label="Chat ID"
              placeholder="972501234567"
              isConfigured={credentialsStatus.has_greenapi_chat_id}
              value={newGreenApiChatId}
              onUpdate={setNewGreenApiChatId}
            />
          </CardContent>
        </Card>

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
          </CardContent>
        </Card>

        {/* Custom AI Prompt */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Prompt Templates
            </CardTitle>
            <CardDescription>
              בחר סגנון מוכן או כתוב פרומפט מותאם אישית. המידע על קופונים וקישורים יילקח אוטומטית מהמוצר
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pre-defined prompt type selector */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">סגנון פוסט מוכן</Label>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(PROMPT_TEMPLATES).map(([key, template]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (selectedPromptType === key) {
                        setSelectedPromptType(null);
                        setCustomAiPrompt('');
                      } else {
                        setSelectedPromptType(key);
                        setCustomAiPrompt(template.prompt);
                      }
                    }}
                    className={`p-4 rounded-xl border-2 text-right transition-all ${
                      selectedPromptType === key
                        ? 'border-primary bg-primary/10 shadow-lg'
                        : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{template.icon}</span>
                      <span className="font-semibold text-foreground">{template.nameHe}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{template.name}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">או כתוב פרומפט מותאם</span>
              </div>
            </div>

            <Textarea
              value={customAiPrompt}
              onChange={(e) => {
                setCustomAiPrompt(e.target.value);
                setSelectedPromptType(null);
              }}
              placeholder="השאר ריק לשימוש בפרומפט ברירת מחדל. כתוב הוראות מותאמות אישית לAI כאן..."
              className="min-h-[200px] font-mono text-sm"
              dir="rtl"
            />
            <div className="bg-muted/50 p-3 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground" dir="rtl">
                💡 <strong>טיפ:</strong> אל תכלול קישורים או קופונים בפרומפט - המידע הזה יילקח אוטומטית מהקישור שהוזן או מהקופון שהוספת ידנית למוצר
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
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
