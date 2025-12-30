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
  RotateCcw
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface MaskedInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
}

const MaskedInput = ({ label, value, onChange, placeholder, description }: MaskedInputProps) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="relative">
        <Input
          type={isVisible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
          onClick={() => setIsVisible(!isVisible)}
        >
          {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
};

interface MessagingAccount {
  id: string;
  account_type: string;
  account_name: string;
  is_active: boolean;
  telegram_bot_token?: string | null;
  telegram_chat_id?: string | null;
  greenapi_instance_id?: string | null;
  greenapi_api_token?: string | null;
  greenapi_chat_id?: string | null;
}

interface AutomationLogRow {
  id: string;
  created_at: string;
  level: string;
  message: string;
  context: any;
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
  
  // Master automation toggle
  const [automationEnabled, setAutomationEnabled] = useState(false);
  
  // Posting times
  const [postingTimes, setPostingTimes] = useState<string[]>(['10:00', '14:00', '20:00']);
  const [newTime, setNewTime] = useState('');
  
  // Publishing days (0=Sunday, 6=Saturday)
  const [publishingDays, setPublishingDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  // AliExpress credentials
  const [aliexpressAppKey, setAliexpressAppKey] = useState('');
  const [aliexpressAppSecret, setAliexpressAppSecret] = useState('');
  const [aliexpressTrackingId, setAliexpressTrackingId] = useState('');

  // Custom AI prompt
  const [customAiPrompt, setCustomAiPrompt] = useState('');
  const [selectedPromptType, setSelectedPromptType] = useState<string | null>(null);

  // Multi-account management
  const [messagingAccounts, setMessagingAccounts] = useState<MessagingAccount[]>([]);
  const [showAddAccount, setShowAddAccount] = useState<'telegram' | 'whatsapp' | null>(null);
  const [newAccountName, setNewAccountName] = useState('');
  const [newTelegramToken, setNewTelegramToken] = useState('');
  const [newTelegramChatId, setNewTelegramChatId] = useState('');
  const [newGreenApiInstanceId, setNewGreenApiInstanceId] = useState('');
  const [newGreenApiToken, setNewGreenApiToken] = useState('');
  const [newGreenApiChatId, setNewGreenApiChatId] = useState('');

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

      // Fetch app settings
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettingsId(data.id);
        setAutomationEnabled(data.automation_enabled || false);
        setPostingTimes(data.posting_times || ['10:00', '14:00', '20:00']);
        setPublishingDays(data.publishing_days || [0, 1, 2, 3, 4, 5, 6]);
        setAliexpressAppKey(data.aliexpress_app_key || '');
        setAliexpressAppSecret(data.aliexpress_app_secret || '');
        setAliexpressTrackingId(data.aliexpress_tracking_id || '');
        setCustomAiPrompt(data.custom_ai_prompt || '');
      }

      // Fetch messaging accounts
      const { data: accounts, error: accountsErr } = await supabase
        .from('messaging_accounts')
        .select('*')
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
      const updateData = {
        automation_enabled: automationEnabled,
        posting_times: postingTimes,
        publishing_days: publishingDays,
        aliexpress_app_key: aliexpressAppKey || null,
        aliexpress_app_secret: aliexpressAppSecret || null,
        aliexpress_tracking_id: aliexpressTrackingId || null,
        custom_ai_prompt: customAiPrompt || null,
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

      if (showAddAccount === 'telegram') {
        accountData.telegram_bot_token = newTelegramToken;
        accountData.telegram_chat_id = newTelegramChatId;
      } else {
        accountData.greenapi_instance_id = newGreenApiInstanceId;
        accountData.greenapi_api_token = newGreenApiToken;
        accountData.greenapi_chat_id = newGreenApiChatId;
      }

      const { data, error } = await supabase
        .from('messaging_accounts')
        .insert(accountData)
        .select()
        .single();

      if (error) throw error;

      setMessagingAccounts([...messagingAccounts, data]);
      setShowAddAccount(null);
      setNewAccountName('');
      setNewTelegramToken('');
      setNewTelegramChatId('');
      setNewGreenApiInstanceId('');
      setNewGreenApiToken('');
      setNewGreenApiChatId('');

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

            {/* Posting Times */}
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
              <div className="flex items-center justify-between p-4 rounded-xl bg-destructive/5 border border-destructive/20">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <RotateCcw className="h-5 w-5 text-destructive" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Reset Stuck Posts</p>
                    <p className="text-sm text-muted-foreground">
                      Reset all 'processing' products back to 'Scheduled'
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleResetStuckPosts}
                  disabled={isResettingStuck}
                >
                  {isResettingStuck ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-1" />
                  )}
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Logs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>System Logs</CardTitle>
              <CardDescription>
                Server-side automation attempts (timestamps shown in Israel time)
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={!userId || logsLoading}
              onClick={() => userId && fetchSystemLogs(userId)}
            >
              {logsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              <span className="ml-2">Refresh</span>
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[340px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[170px]">Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead>Error Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {systemLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        No logs yet. Once the server runs a check, entries will appear here.
                      </TableCell>
                    </TableRow>
                  ) : (
                    systemLogs.map((log) => {
                      const ts = new Date(log.created_at).toLocaleString('en-GB', {
                        timeZone: 'Asia/Jerusalem',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        day: '2-digit',
                        month: '2-digit',
                      });

                      const ctx = log.context || {};
                      const errorMsg =
                        log.level === 'error'
                          ? (ctx.errorMessage as string) ||
                            (Array.isArray(ctx.errors) ? ctx.errors.join(' | ') : '') ||
                            ''
                          : '';

                      return (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs">{ts}</TableCell>
                          <TableCell className="text-sm">{log.message}</TableCell>
                          <TableCell>
                            <Badge
                              variant={log.level === 'error' ? 'destructive' : log.level === 'warn' ? 'secondary' : 'outline'}
                            >
                              {log.level.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {errorMsg || '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
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
              Telegram Accounts
              <Badge variant="secondary">{telegramAccounts.length}</Badge>
            </CardTitle>
            <CardDescription>
              Manage your Telegram bot destinations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {telegramAccounts.map((account) => (
              <div key={account.id} className={`p-4 rounded-lg border transition-all ${
                account.is_active ? 'bg-[#229ED9]/10 border-[#229ED9]/30' : 'bg-muted/30 border-border'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${account.is_active ? 'bg-[#229ED9]/20' : 'bg-muted'}`}>
                      <svg viewBox="0 0 24 24" className={`h-4 w-4 ${account.is_active ? 'text-[#229ED9]' : 'text-muted-foreground'}`} fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{account.account_name}</p>
                      <p className="text-xs text-muted-foreground">Chat: {account.telegram_chat_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={account.is_active}
                      onCheckedChange={(checked) => handleToggleAccount(account.id, checked)}
                      className={account.is_active ? 'data-[state=checked]:bg-[#229ED9]' : ''}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteAccount(account.id)}
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {showAddAccount === 'telegram' ? (
              <div className="p-4 rounded-lg border border-dashed border-[#229ED9]/50 bg-[#229ED9]/5 space-y-3">
                <Input
                  placeholder="Account Name (e.g., Main Channel)"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                />
                <MaskedInput
                  label="Bot Token"
                  value={newTelegramToken}
                  onChange={setNewTelegramToken}
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                />
                <Input
                  placeholder="Chat ID (e.g., -1001234567890)"
                  value={newTelegramChatId}
                  onChange={(e) => setNewTelegramChatId(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button onClick={handleAddAccount} className="flex-1">
                    <Plus className="h-4 w-4 mr-1" /> Add Account
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddAccount(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full border-dashed border-[#229ED9]/50 text-[#229ED9] hover:bg-[#229ED9]/10"
                onClick={() => setShowAddAccount('telegram')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Telegram Account
              </Button>
            )}
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
              WhatsApp Accounts (GreenAPI)
              <Badge variant="secondary">{whatsappAccounts.length}</Badge>
            </CardTitle>
            <CardDescription>
              Manage your WhatsApp destinations via GreenAPI
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {whatsappAccounts.map((account) => (
              <div key={account.id} className={`p-4 rounded-lg border transition-all ${
                account.is_active ? 'bg-[#25D366]/10 border-[#25D366]/30' : 'bg-muted/30 border-border'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${account.is_active ? 'bg-[#25D366]/20' : 'bg-muted'}`}>
                      <svg viewBox="0 0 24 24" className={`h-4 w-4 ${account.is_active ? 'text-[#25D366]' : 'text-muted-foreground'}`} fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{account.account_name}</p>
                      <p className="text-xs text-muted-foreground">Instance: {account.greenapi_instance_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={account.is_active}
                      onCheckedChange={(checked) => handleToggleAccount(account.id, checked)}
                      className={account.is_active ? 'data-[state=checked]:bg-[#25D366]' : ''}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteAccount(account.id)}
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {showAddAccount === 'whatsapp' ? (
              <div className="p-4 rounded-lg border border-dashed border-[#25D366]/50 bg-[#25D366]/5 space-y-3">
                <Input
                  placeholder="Account Name (e.g., Group 1)"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                />
                <MaskedInput
                  label="Instance ID"
                  value={newGreenApiInstanceId}
                  onChange={setNewGreenApiInstanceId}
                  placeholder="1234567890"
                />
                <MaskedInput
                  label="API Token"
                  value={newGreenApiToken}
                  onChange={setNewGreenApiToken}
                  placeholder="your-api-token-here"
                />
                <Input
                  placeholder="Chat ID (e.g., 972501234567)"
                  value={newGreenApiChatId}
                  onChange={(e) => setNewGreenApiChatId(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button onClick={handleAddAccount} className="flex-1 bg-[#25D366] hover:bg-[#25D366]/90">
                    <Plus className="h-4 w-4 mr-1" /> Add Account
                  </Button>
                  <Button variant="outline" onClick={() => setShowAddAccount(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full border-dashed border-[#25D366]/50 text-[#25D366] hover:bg-[#25D366]/10"
                onClick={() => setShowAddAccount('whatsapp')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add WhatsApp Account
              </Button>
            )}
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
              Configure your AliExpress API credentials for generating affiliate links
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <MaskedInput
              label="App Key"
              value={aliexpressAppKey}
              onChange={setAliexpressAppKey}
              placeholder="Enter your AliExpress App Key"
            />
            <MaskedInput
              label="App Secret"
              value={aliexpressAppSecret}
              onChange={setAliexpressAppSecret}
              placeholder="Enter your AliExpress App Secret"
            />
            <MaskedInput
              label="Tracking ID"
              value={aliexpressTrackingId}
              onChange={setAliexpressTrackingId}
              placeholder="Enter your Tracking ID"
            />
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
