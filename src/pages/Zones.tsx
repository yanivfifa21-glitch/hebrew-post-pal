import { useState, useEffect, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Trash2, RefreshCw, Package, Clock,
  ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, Eye, EyeOff, ExternalLink, ListPlus, Pencil, Save, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

const API = '/api/zones';
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface Group { jid: string; name: string; }

interface Zone {
  id: string;
  name: string;
  is_active: number;
  group_jid: string;
  group_name: string;
  interval_minutes: number;
  start_hour: number;
  start_minute: number;
  end_hour: number;
  end_minute: number;
  stack_count: number;
  is_configured: boolean;
  connection_type: 'greenapi' | 'baileys';
  baileys_status: 'disconnected' | 'connecting' | 'awaiting_qr' | 'connected' | 'reconnecting';
  platform: 'whatsapp' | 'telegram';
  telegram_chat_id: string;
  shabbat_mode: number;
  shabbat_stop_hour: number;
  shabbat_stop_minute: number;
  shabbat_resume_hour: number;
  shabbat_resume_minute: number;
  telegram_extra_chat_ids: string;
}

interface TelegramAccount {
  id: string;
  name: string;
  chat_id: string;
}

interface QueueProduct {
  id: string;
  hebrew_description: string | null;
  title: string | null;
  affiliate_link: string | null;
  image_url: string | null;
  created_at: string;
  status: string | null;
}

interface StackItem {
  id: string;
  sort_order: number;
  estimated_send_at: number;
  product: { title?: string; hebrew_description?: string; image_url?: string; affiliate_link?: string };
}

export default function Zones() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [newZoneName, setNewZoneName] = useState('');
  const [adding, setAdding] = useState(false);
  const [expandedZone, setExpandedZone] = useState<string | null>(null);
  const [stackMap, setStackMap] = useState<Record<string, StackItem[]>>({});
  const [skipHoursMap, setSkipHoursMap] = useState<Record<string, number[]>>({});
  const [groupsMap, setGroupsMap] = useState<Record<string, Group[]>>({});
  const [loadingGroups, setLoadingGroups] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState<string | null>(null);
  const [scheduleEdits, setScheduleEdits] = useState<Record<string, Partial<Zone>>>({});
  const [credForm, setCredForm] = useState<Record<string, { instanceId: string; apiToken: string; showToken: boolean }>>({});
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [connectingBaileys, setConnectingBaileys] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<StackItem | null>(null);
  const [previewZoneId, setPreviewZoneId] = useState<string | null>(null);
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [editText, setEditText] = useState('');
  const [editAffLink, setEditAffLink] = useState('');
  const [savingPost, setSavingPost] = useState(false);
  const [telegramAccounts, setTelegramAccounts] = useState<TelegramAccount[]>([]);
  const [telegramForm, setTelegramForm] = useState<Record<string, { accountId: string; chatId: string; botToken: string; showToken: boolean }>>({});
  const [queueDialogZone, setQueueDialogZone] = useState<string | null>(null);
  const [queueProducts, setQueueProducts] = useState<QueueProduct[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueOffset, setQueueOffset] = useState(0);
  const [queueHasMore, setQueueHasMore] = useState(false);
  const [queueSearch, setQueueSearch] = useState('');
  const [addingToStack, setAddingToStack] = useState<Set<string>>(new Set());
  const [addedToStack, setAddedToStack] = useState<Set<string>>(new Set());
  const [pendingReorder, setPendingReorder] = useState<Record<string, boolean>>({});
  const [savingOrder, setSavingOrder] = useState<string | null>(null);
  const [extraChatInput, setExtraChatInput] = useState<Record<string, string>>({});
  const [savingExtras, setSavingExtras] = useState<string | null>(null);

  const h = useCallback((extra?: Record<string, string>) => ({
    'Content-Type': 'application/json',
    ...(userId ? { 'X-User-Id': userId } : {}),
    ...extra,
  }), [userId]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  useEffect(() => {
    supabase.from('messaging_accounts')
      .select('id, account_name, telegram_chat_id')
      .eq('account_type', 'telegram')
      .eq('is_active', true)
      .then(({ data }) => {
        if (data) setTelegramAccounts(data.map(a => ({
          id: a.id,
          name: a.account_name || a.id,
          chat_id: a.telegram_chat_id || '',
        })));
      });
  }, []);

  const fetchZones = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await fetch(API, { headers: { 'X-User-Id': userId } });
      setZones(await r.json());
    } catch {}
    setLoading(false);
  }, [userId]);

  useEffect(() => { if (userId) fetchZones(); }, [fetchZones, userId]);
  useEffect(() => {
    if (!userId) return;
    const t = setInterval(fetchZones, 10000);
    return () => clearInterval(t);
  }, [fetchZones, userId]);

  // ── Add / delete ──────────────────────────────────────────────
  const addZone = async () => {
    if (!newZoneName.trim() || !userId) return;
    setAdding(true);
    try {
      const r = await fetch(API, {
        method: 'POST',
        headers: h(),
        body: JSON.stringify({ name: newZoneName.trim() }),
      });
      const z = await r.json();
      setZones(prev => [...prev, z]);
      setNewZoneName('');
      toast({ title: `✅ אזור "${z.name}" נוצר` });
    } catch { toast({ title: 'שגיאה ביצירת אזור', variant: 'destructive' }); }
    setAdding(false);
  };

  const deleteZone = async (zone: Zone) => {
    if (!confirm(`למחוק את "${zone.name}"?`)) return;
    await fetch(`${API}/${zone.id}`, { method: 'DELETE', headers: h() });
    setZones(prev => prev.filter(z => z.id !== zone.id));
    toast({ title: `🗑️ "${zone.name}" נמחק` });
  };

  // ── Baileys ───────────────────────────────────────────────────
  const connectBaileys = async (zone: Zone) => {
    setConnectingBaileys(zone.id);
    await fetch(`${API}/${zone.id}/baileys/connect`, { method: 'POST', headers: h() });
    setZones(prev => prev.map(z => z.id === zone.id ? { ...z, connection_type: 'baileys', baileys_status: 'connecting' } : z));
    // Poll for QR / status
    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      const st = await fetch(`${API}/${zone.id}/baileys/status`, { headers: h() }).then(r => r.json()).catch(() => null);
      if (!st) return;
      setZones(prev => prev.map(z => z.id === zone.id ? { ...z, baileys_status: st.baileys_status, is_configured: st.baileys_status === 'connected' } : z));
      if (st.has_qr) {
        setQrMap(prev => ({ ...prev, [zone.id]: `${API}/${zone.id}/qr?t=${Date.now()}` }));
      }
      if (st.baileys_status === 'connected') {
        clearInterval(poll);
        setConnectingBaileys(null);
        setQrMap(prev => { const n = { ...prev }; delete n[zone.id]; return n; });
        toast({ title: '✅ WhatsApp מחובר!' });
        fetchGroups(zone.id);
      }
      if (attempts > 60) { clearInterval(poll); setConnectingBaileys(null); }
    }, 3000);
  };

  const disconnectBaileys = async (zone: Zone) => {
    await fetch(`${API}/${zone.id}/baileys/disconnect`, { method: 'DELETE', headers: h() });
    setZones(prev => prev.map(z => z.id === zone.id ? { ...z, connection_type: 'greenapi', baileys_status: 'disconnected', is_configured: false } : z));
    setQrMap(prev => { const n = { ...prev }; delete n[zone.id]; return n; });
    toast({ title: 'החיבור נותק' });
  };

  // ── Green API credentials ─────────────────────────────────────
  const getCred = (zoneId: string) =>
    credForm[zoneId] || { instanceId: '', apiToken: '', showToken: false };

  const setCred = (zoneId: string, patch: Partial<{ instanceId: string; apiToken: string; showToken: boolean }>) =>
    setCredForm(prev => ({ ...prev, [zoneId]: { ...getCred(zoneId), ...patch } }));

  const saveAccount = async (zone: Zone) => {
    const { instanceId, apiToken } = getCred(zone.id);
    if (!instanceId.trim() || !apiToken.trim()) {
      toast({ title: 'נא למלא Instance ID ו-API Token', variant: 'destructive' });
      return;
    }
    setSavingAccount(zone.id);
    try {
      await fetch(`${API}/${zone.id}/account`, {
        method: 'PUT',
        headers: h(),
        body: JSON.stringify({ greenapi_instance_id: instanceId.trim(), greenapi_api_token: apiToken.trim() }),
      });
      setZones(prev => prev.map(z => z.id === zone.id ? { ...z, is_configured: true } : z));
      toast({ title: '✅ הCredentials נשמרו' });
      // Auto-fetch groups
      fetchGroups(zone.id);
    } catch { toast({ title: 'שגיאה בשמירה', variant: 'destructive' }); }
    setSavingAccount(null);
  };

  // ── Telegram ──────────────────────────────────────────────────
  const getTelegramForm = (zoneId: string) =>
    telegramForm[zoneId] || { accountId: '', chatId: '', botToken: '', showToken: false };

  const setTelegramField = (zoneId: string, patch: Partial<typeof telegramForm[string]>) =>
    setTelegramForm(prev => ({ ...prev, [zoneId]: { ...getTelegramForm(zoneId), ...patch } }));

  const saveTelegramAccount = async (zone: Zone) => {
    const form = getTelegramForm(zone.id);
    const chatId = form.chatId.trim() || zone.telegram_chat_id || '';
    if (!form.botToken.trim() || !chatId) {
      toast({ title: 'נא למלא Bot Token ו-Chat ID', variant: 'destructive' });
      return;
    }
    setSavingAccount(zone.id);
    try {
      await fetch(`${API}/${zone.id}/telegram`, {
        method: 'PUT',
        headers: h(),
        body: JSON.stringify({ telegram_bot_token: form.botToken.trim(), telegram_chat_id: chatId }),
      });
      setTelegramField(zone.id, { botToken: '', chatId: '', accountId: '' });
      setZones(prev => prev.map(z => z.id === zone.id
        ? { ...z, platform: 'telegram', is_configured: true, telegram_chat_id: chatId }
        : z
      ));
      toast({ title: '✅ טלגרם הוגדר בהצלחה' });
    } catch { toast({ title: 'שגיאה בשמירה', variant: 'destructive' }); }
    setSavingAccount(null);
  };

  const switchPlatform = async (zone: Zone, platform: 'whatsapp' | 'telegram') => {
    setZones(prev => prev.map(z => z.id === zone.id ? { ...z, platform } : z));
  };

  // ── Groups ────────────────────────────────────────────────────
  const fetchGroups = async (zoneId: string) => {
    setLoadingGroups(zoneId);
    try {
      const r = await fetch(`${API}/${zoneId}/groups`, { headers: h() });
      if (!r.ok) throw new Error(await r.text());
      const groups = await r.json();
      setGroupsMap(prev => ({ ...prev, [zoneId]: groups }));
      if (groups.length === 0) toast({ title: 'לא נמצאו קבוצות בחשבון זה' });
    } catch (e: any) {
      toast({ title: `שגיאה בטעינת קבוצות: ${e.message}`, variant: 'destructive' });
    }
    setLoadingGroups(null);
  };

  const setGroup = async (zoneId: string, jid: string, name: string) => {
    await fetch(`${API}/${zoneId}/group`, {
      method: 'PUT',
      headers: h(),
      body: JSON.stringify({ group_jid: jid, group_name: name }),
    });
    setZones(prev => prev.map(z => z.id === zoneId ? { ...z, group_jid: jid, group_name: name } : z));
    toast({ title: `✅ קבוצה: ${name}` });
  };

  // ── Schedule ──────────────────────────────────────────────────
  const editSchedule = (zoneId: string, patch: Partial<Zone>) =>
    setScheduleEdits(prev => ({ ...prev, [zoneId]: { ...prev[zoneId], ...patch } }));

  const saveSchedule = async (zone: Zone) => {
    const edits = scheduleEdits[zone.id] || {};
    const u = { ...zone, ...edits };
    setSavingSchedule(zone.id);
    await fetch(`${API}/${zone.id}/schedule`, {
      method: 'PUT',
      headers: h(),
      body: JSON.stringify({
        interval_minutes: u.interval_minutes,
        start_hour: u.start_hour, start_minute: u.start_minute ?? 0,
        end_hour: u.end_hour, end_minute: u.end_minute ?? 0,
        is_active: u.is_active,
        shabbat_mode: u.shabbat_mode ?? 0,
        shabbat_stop_hour: u.shabbat_stop_hour ?? 18, shabbat_stop_minute: u.shabbat_stop_minute ?? 0,
        shabbat_resume_hour: u.shabbat_resume_hour ?? 22, shabbat_resume_minute: u.shabbat_resume_minute ?? 0,
      }),
    });
    setZones(prev => prev.map(z => z.id === zone.id ? { ...z, ...edits } : z));
    setScheduleEdits(prev => { const n = { ...prev }; delete n[zone.id]; return n; });
    setSavingSchedule(null);
    toast({ title: '✅ תזמון נשמר' });
  };

  const toggleActive = async (zone: Zone) => {
    const newActive = zone.is_active ? 0 : 1;
    await fetch(`${API}/${zone.id}/schedule`, {
      method: 'PUT',
      headers: h(),
      body: JSON.stringify({
        interval_minutes: zone.interval_minutes,
        start_hour: zone.start_hour, start_minute: zone.start_minute ?? 0,
        end_hour: zone.end_hour, end_minute: zone.end_minute ?? 0,
        is_active: newActive,
        shabbat_mode: zone.shabbat_mode ?? 0,
        shabbat_stop_hour: zone.shabbat_stop_hour ?? 18, shabbat_stop_minute: zone.shabbat_stop_minute ?? 0,
        shabbat_resume_hour: zone.shabbat_resume_hour ?? 22, shabbat_resume_minute: zone.shabbat_resume_minute ?? 0,
      }),
    });
    setZones(prev => prev.map(z => z.id === zone.id ? { ...z, is_active: newActive } : z));
  };

  // ── Skip hours ────────────────────────────────────────────────
  const toggleSkipHour = async (zoneId: string, hour: number) => {
    const r = await fetch(`${API}/${zoneId}/skip`, {
      method: 'POST',
      headers: h(),
      body: JSON.stringify({ hour }),
    });
    const data = await r.json();
    setSkipHoursMap(prev => {
      const cur = prev[zoneId] || [];
      return { ...prev, [zoneId]: data.skipped ? [...cur, hour] : cur.filter(h => h !== hour) };
    });
  };

  // ── Expand ────────────────────────────────────────────────────
  const toggleExpand = async (zone: Zone) => {
    if (expandedZone === zone.id) { setExpandedZone(null); return; }
    setExpandedZone(zone.id);
    // Load stack + skip hours
    const [sr, skr] = await Promise.all([
      fetch(`${API}/${zone.id}/stack`, { headers: h() }),
      fetch(`${API}/${zone.id}/skip-hours`, { headers: h() }),
    ]);
    setStackMap(prev => ({ ...prev, [zone.id]: [] }));
    setSkipHoursMap(prev => ({ ...prev, [zone.id]: [] }));
    sr.json().then(items => setStackMap(prev => ({ ...prev, [zone.id]: items })));
    skr.json().then(h => setSkipHoursMap(prev => ({ ...prev, [zone.id]: h })));
    // If configured WhatsApp zone, fetch groups
    if (zone.is_configured && (zone.platform || 'whatsapp') === 'whatsapp' && !groupsMap[zone.id]) fetchGroups(zone.id);
  };

  const removeFromStack = async (zoneId: string, itemId: string) => {
    await fetch(`${API}/${zoneId}/stack/${itemId}`, { method: 'DELETE', headers: h() });
    setStackMap(prev => ({ ...prev, [zoneId]: (prev[zoneId] || []).filter(i => i.id !== itemId) }));
    setZones(prev => prev.map(z => z.id === zoneId ? { ...z, stack_count: Math.max(0, z.stack_count - 1) } : z));
  };

  const moveInStack = (zoneId: string, idx: number, dir: -1 | 1) => {
    const items = stackMap[zoneId] || [];
    const otherIdx = idx + dir;
    if (otherIdx < 0 || otherIdx >= items.length) return;
    setStackMap(prev => {
      const arr = [...(prev[zoneId] || [])].map(item => ({ ...item }));
      const orderA = arr[idx].sort_order;
      const orderB = arr[otherIdx].sort_order;
      [arr[idx], arr[otherIdx]] = [arr[otherIdx], arr[idx]];
      arr[idx].sort_order = orderA;
      arr[otherIdx].sort_order = orderB;
      const first = arr[0]?.estimated_send_at || Math.floor(Date.now() / 1000 + 60);
      const zone = zones.find(z => z.id === zoneId);
      const intervalSec = (zone?.interval_minutes || 60) * 60;
      return { ...prev, [zoneId]: arr.map((item, i) => ({ ...item, estimated_send_at: first + i * intervalSec })) };
    });
    setPendingReorder(prev => ({ ...prev, [zoneId]: true }));
  };

  const saveOrder = async (zoneId: string) => {
    setSavingOrder(zoneId);
    const items = stackMap[zoneId] || [];
    // Assign clean sequential sort_orders based on current positions
    const order = items.map((item, i) => ({ id: item.id, sort_order: i + 1 }));
    try {
      await fetch(`${API}/${zoneId}/stack/save-order`, {
        method: 'PUT',
        headers: h(),
        body: JSON.stringify({ order }),
      });
      // Update local sort_orders to match what was saved
      setStackMap(prev => ({
        ...prev,
        [zoneId]: (prev[zoneId] || []).map((item, i) => ({ ...item, sort_order: i + 1 })),
      }));
      setPendingReorder(prev => ({ ...prev, [zoneId]: false }));
      toast({ title: '✅ סדר הפוסטים נשמר' });
    } catch {
      toast({ title: 'שגיאה בשמירת הסדר', variant: 'destructive' });
    }
    setSavingOrder(null);
  };

  // ── Edit stack post ───────────────────────────────────────────
  const openEditPost = (item: StackItem, zoneId: string) => {
    setPreviewItem(item);
    setPreviewZoneId(zoneId);
    setEditText(item.product?.hebrew_description || item.product?.title || '');
    setEditAffLink(item.product?.affiliate_link || '');
    setIsEditingPost(true);
  };

  const savePostEdit = async () => {
    if (!previewItem || !previewZoneId) return;
    setSavingPost(true);
    const updatedProduct = {
      ...previewItem.product,
      hebrew_description: editText,
      affiliate_link: editAffLink || previewItem.product?.affiliate_link,
    };
    try {
      // Update zone stack (SQLite)
      await fetch(`${API}/${previewZoneId}/stack/${previewItem.id}`, {
        method: 'PUT',
        headers: h(),
        body: JSON.stringify({ product: updatedProduct }),
      });
      // Update Supabase products table (if product has an id)
      if (previewItem.product?.id) {
        await supabase.from('products').update({
          hebrew_description: editText,
          affiliate_link: editAffLink || previewItem.product.affiliate_link,
        }).eq('id', previewItem.product.id);
      }
      // Update local stackMap
      setStackMap(prev => {
        const arr = (prev[previewZoneId] || []).map(i =>
          i.id === previewItem.id ? { ...i, product: updatedProduct } : i
        );
        return { ...prev, [previewZoneId]: arr };
      });
      setPreviewItem({ ...previewItem, product: updatedProduct });
      setIsEditingPost(false);
      toast({ title: '✅ הפוסט עודכן' });
    } catch {
      toast({ title: 'שגיאה בשמירה', variant: 'destructive' });
    }
    setSavingPost(false);
  };

  // ── Queue dialog ──────────────────────────────────────────────
  const PAGE = 20;

  const loadQueue = async (offset: number, search: string) => {
    if (!userId) return;
    setQueueLoading(true);
    let query = supabase
      .from('products')
      .select('id, hebrew_description, title, affiliate_link, image_url, created_at, status')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (search.trim()) query = query.ilike('hebrew_description', `%${search.trim()}%`);
    const { data } = await query;
    const rows = data || [];
    setQueueHasMore(rows.length === PAGE);
    if (offset === 0) setQueueProducts(rows);
    else setQueueProducts(prev => [...prev, ...rows]);
    setQueueOffset(offset);
    setQueueLoading(false);
  };

  const openQueueDialog = (zoneId: string) => {
    setQueueDialogZone(zoneId);
    setQueueSearch('');
    setQueueOffset(0);
    setAddedToStack(new Set());
    loadQueue(0, '');
  };

  const addFromQueue = async (zoneId: string, product: QueueProduct) => {
    setAddingToStack(prev => new Set(prev).add(product.id));
    try {
      await fetch(`${API}/stack/add`, {
        method: 'POST',
        headers: h(),
        body: JSON.stringify({
          zone_ids: [zoneId],
          product: {
            id: product.id,
            hebrew_description: product.hebrew_description,
            title: product.title,
            affiliate_link: product.affiliate_link,
            image_url: product.image_url,
          },
        }),
      });
      setAddedToStack(prev => new Set(prev).add(product.id));
      setZones(prev => prev.map(z => z.id === zoneId ? { ...z, stack_count: z.stack_count + 1 } : z));
      // Also update stackMap if loaded
      setStackMap(prev => {
        if (!prev[zoneId]) return prev;
        return prev; // stack will refresh on next expand
      });
    } catch {
      toast({ title: 'שגיאה בהוספה', variant: 'destructive' });
    }
    setAddingToStack(prev => { const n = new Set(prev); n.delete(product.id); return n; });
  };

  const getExtraChatIds = (zone: Zone): string[] => {
    try { return JSON.parse(zone.telegram_extra_chat_ids || '[]'); } catch { return []; }
  };

  const saveExtraChatIds = async (zone: Zone, ids: string[]) => {
    setSavingExtras(zone.id);
    await fetch(`${API}/${zone.id}/telegram-extras`, {
      method: 'PUT', headers: h(),
      body: JSON.stringify({ extra_chat_ids: ids }),
    });
    setZones(prev => prev.map(z => z.id === zone.id
      ? { ...z, telegram_extra_chat_ids: JSON.stringify(ids) } : z));
    setSavingExtras(null);
  };

  const addExtraChatId = async (zone: Zone) => {
    const val = (extraChatInput[zone.id] || '').trim();
    if (!val) return;
    const cur = getExtraChatIds(zone);
    if (cur.includes(val)) return;
    await saveExtraChatIds(zone, [...cur, val]);
    setExtraChatInput(prev => ({ ...prev, [zone.id]: '' }));
    toast({ title: `✅ נוסף: ${val}` });
  };

  const removeExtraChatId = async (zone: Zone, chatId: string) => {
    await saveExtraChatIds(zone, getExtraChatIds(zone).filter(id => id !== chatId));
  };

  const fmtTime = (unixSec: number) => {
    const d = new Date(unixSec * 1000);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();
    const timeStr = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `היום ${timeStr}`;
    if (isTomorrow) return `מחר ${timeStr}`;
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) + ` ${timeStr}`;
  };

  // ─────────────────────────────────────────────────────────────
  if (loading) return (
    <MainLayout>
      <div className="flex justify-center mt-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
    </MainLayout>
  );

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto p-4 space-y-4" dir="rtl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold font-hebrew">📍 אזורי שליחה</h1>
          <Button variant="outline" size="sm" onClick={fetchZones}><RefreshCw className="w-4 h-4" /></Button>
        </div>

        {/* Add zone */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex gap-2">
              <Button onClick={addZone} disabled={adding || !newZoneName.trim()}>
                <Plus className="w-4 h-4 ml-1" />הוסף
              </Button>
              <Input
                placeholder="שם אזור חדש (למשל: דילים כללי)"
                value={newZoneName}
                onChange={e => setNewZoneName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addZone()}
                className="text-right font-hebrew"
              />
            </div>
          </CardContent>
        </Card>

        {zones.length === 0 && (
          <div className="text-center text-muted-foreground py-12 font-hebrew">
            אין אזורים עדיין. צור אזור ראשון למעלה.
          </div>
        )}

        {zones.map(zone => {
          const edits = scheduleEdits[zone.id] || {};
          const display = { ...zone, ...edits };
          const isExpanded = expandedZone === zone.id;
          const skipHours = skipHoursMap[zone.id] || [];
          const groups = groupsMap[zone.id] || [];
          const cred = getCred(zone.id);

          return (
            <Card key={zone.id} className={cn("border-2 transition-colors",
              zone.is_configured ? 'border-green-500/30' : 'border-border'
            )}>
              {/* Header */}
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    {zone.is_configured
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      : <XCircle className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <CardTitle className="text-base font-hebrew">{zone.name}</CardTitle>
                    {zone.group_name && (
                      <span className="text-xs text-muted-foreground font-hebrew">({zone.group_name})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch checked={!!zone.is_active} onCheckedChange={() => toggleActive(zone)} />
                    <Button variant="ghost" size="icon" onClick={() => toggleExpand(zone)}>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteZone(zone)}>
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                </div>

                <div className="flex gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                  <span><Clock className="w-3 h-3 inline ml-1" />כל {zone.interval_minutes} דקות</span>
                  <span>{String(zone.start_hour).padStart(2,'0')}:{String(zone.start_minute ?? 0).padStart(2,'0')} – {String(zone.end_hour).padStart(2,'0')}:{String(zone.end_minute ?? 0).padStart(2,'0')}</span>
                  <span><Package className="w-3 h-3 inline ml-1" />{zone.stack_count} פוסטים</span>
                  {!!zone.shabbat_mode && (
                    <span className="text-blue-600 font-medium">🕍 שבת</span>
                  )}
                </div>
              </CardHeader>

              {isExpanded && (
                <CardContent className="space-y-5 pt-0">
                  {/* ── חיבור ── */}
                  <div className="border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm font-hebrew">
                        {(zone.platform || 'whatsapp') === 'telegram' ? '📲 חיבור טלגרם' : '📱 חיבור WhatsApp'}
                      </div>
                      {zone.is_configured && (
                        <Badge className="bg-green-500/10 text-green-600 border-green-500/30 text-xs font-hebrew">
                          <CheckCircle2 className="w-3 h-3 ml-1" />מחובר
                        </Badge>
                      )}
                    </div>

                    {/* Platform selector */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => switchPlatform(zone, 'whatsapp')}
                        className={cn(
                          "p-2 rounded-lg border text-xs font-hebrew text-center transition-all",
                          (zone.platform || 'whatsapp') === 'whatsapp'
                            ? "border-primary bg-primary/10 font-semibold"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        📱 WhatsApp
                      </button>
                      <button
                        onClick={() => switchPlatform(zone, 'telegram')}
                        className={cn(
                          "p-2 rounded-lg border text-xs font-hebrew text-center transition-all",
                          (zone.platform || 'whatsapp') === 'telegram'
                            ? "border-primary bg-primary/10 font-semibold"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        📲 טלגרם
                      </button>
                    </div>

                    {/* ── Telegram form / connected state ── */}
                    {(zone.platform || 'whatsapp') === 'telegram' && (() => {
                      const tForm = getTelegramForm(zone.id);
                      const isEditing = tForm.botToken.length > 0 || tForm.chatId.length > 0;

                      // Connected state — show clean view unless user started editing
                      if (zone.is_configured && zone.telegram_chat_id && !isEditing) {
                        const extras = getExtraChatIds(zone);
                        return (
                          <div className="space-y-2">
                            <div className="text-xs text-green-600 font-hebrew text-center">
                              ✅ מחובר ל: {zone.telegram_chat_id}
                            </div>

                            {/* Extra chat IDs */}
                            {extras.length > 0 && (
                              <div className="space-y-1">
                                {extras.map(cid => (
                                  <div key={cid} className="flex items-center gap-1 bg-muted/40 rounded px-2 py-1">
                                    <span className="flex-1 font-mono text-xs truncate" dir="ltr">{cid}</span>
                                    <button
                                      className="text-muted-foreground hover:text-destructive"
                                      onClick={() => removeExtraChatId(zone, cid)}
                                      disabled={savingExtras === zone.id}
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Add extra chat id */}
                            <div className="flex gap-1">
                              <Input
                                placeholder="@channel2 / chat_id נוסף"
                                value={extraChatInput[zone.id] || ''}
                                onChange={e => setExtraChatInput(prev => ({ ...prev, [zone.id]: e.target.value }))}
                                className="font-mono text-xs h-8"
                                dir="ltr"
                                onKeyDown={e => e.key === 'Enter' && addExtraChatId(zone)}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 font-hebrew text-xs px-2 shrink-0"
                                onClick={() => addExtraChatId(zone)}
                                disabled={savingExtras === zone.id || !(extraChatInput[zone.id] || '').trim()}
                              >
                                {savingExtras === zone.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '+ הוסף'}
                              </Button>
                            </div>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setTelegramField(zone.id, { chatId: zone.telegram_chat_id, botToken: ' ' })}
                              className="w-full font-hebrew text-muted-foreground"
                            >
                              שנה הגדרות טלגרם
                            </Button>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2">
                          {telegramAccounts.length > 0 && (
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground font-hebrew">בחר חשבון טלגרם</label>
                              <Select
                                value={tForm.accountId}
                                onValueChange={v => {
                                  const acc = telegramAccounts.find(a => a.id === v);
                                  setTelegramField(zone.id, {
                                    accountId: v,
                                    chatId: acc?.chat_id || tForm.chatId,
                                  });
                                }}
                              >
                                <SelectTrigger className="text-right font-hebrew">
                                  <SelectValue placeholder="בחר חשבון" />
                                </SelectTrigger>
                                <SelectContent>
                                  {telegramAccounts.map(a => (
                                    <SelectItem key={a.id} value={a.id} className="font-hebrew">{a.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground font-hebrew">Chat ID / שם ערוץ</label>
                            <Input
                              placeholder="@channel_name או -1001234567890"
                              value={tForm.chatId || zone.telegram_chat_id || ''}
                              onChange={e => setTelegramField(zone.id, { chatId: e.target.value })}
                              className="font-mono text-sm"
                              dir="ltr"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground font-hebrew">Bot Token (מ-BotFather)</label>
                            <div className="relative">
                              <Input
                                placeholder="1234567890:ABCDefgh..."
                                value={tForm.botToken.trim()}
                                onChange={e => setTelegramField(zone.id, { botToken: e.target.value })}
                                type={tForm.showToken ? 'text' : 'password'}
                                className="font-mono text-sm pl-8"
                                dir="ltr"
                              />
                              <button
                                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                onClick={() => setTelegramField(zone.id, { showToken: !tForm.showToken })}
                              >
                                {tForm.showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => saveTelegramAccount(zone)}
                            disabled={savingAccount === zone.id || !tForm.botToken.trim() || !(tForm.chatId || zone.telegram_chat_id)}
                            className="w-full font-hebrew"
                          >
                            {savingAccount === zone.id ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                            שמור טלגרם
                          </Button>
                        </div>
                      );
                    })()}

                    {/* ── WhatsApp section ── */}
                    {(zone.platform || 'whatsapp') === 'whatsapp' && (
                      <>
                        {/* Connection type selector */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => setZones(prev => prev.map(z => z.id === zone.id ? { ...z, connection_type: 'greenapi' } : z))}
                            className={cn(
                              "p-2 rounded-lg border text-xs font-hebrew text-center transition-all",
                              (zone.connection_type || 'greenapi') === 'greenapi'
                                ? "border-primary bg-primary/10 font-semibold"
                                : "border-border hover:border-primary/50"
                            )}
                          >
                            🔑 Green API
                          </button>
                          <button
                            onClick={() => setZones(prev => prev.map(z => z.id === zone.id ? { ...z, connection_type: 'baileys' } : z))}
                            className={cn(
                              "p-2 rounded-lg border text-xs font-hebrew text-center transition-all",
                              zone.connection_type === 'baileys'
                                ? "border-primary bg-primary/10 font-semibold"
                                : "border-border hover:border-primary/50"
                            )}
                          >
                            📷 סריקת QR
                          </button>
                        </div>

                        {/* Green API fields */}
                        {(zone.connection_type || 'greenapi') === 'greenapi' && (
                          <div className="space-y-2">
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground font-hebrew">Instance ID</label>
                              <Input
                                placeholder="7103xxxxxx"
                                value={cred.instanceId}
                                onChange={e => setCred(zone.id, { instanceId: e.target.value })}
                                className="font-mono text-sm"
                                dir="ltr"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground font-hebrew">API Token</label>
                              <div className="relative">
                                <Input
                                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                  value={cred.apiToken}
                                  onChange={e => setCred(zone.id, { apiToken: e.target.value })}
                                  type={cred.showToken ? 'text' : 'password'}
                                  className="font-mono text-sm pl-8"
                                  dir="ltr"
                                />
                                <button
                                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                  onClick={() => setCred(zone.id, { showToken: !cred.showToken })}
                                >
                                  {cred.showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => saveAccount(zone)}
                              disabled={savingAccount === zone.id || !cred.instanceId || !cred.apiToken}
                              className="w-full font-hebrew"
                            >
                              {savingAccount === zone.id ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                              שמור וטען קבוצות
                            </Button>
                          </div>
                        )}

                        {/* Baileys QR */}
                        {zone.connection_type === 'baileys' && (
                          <div className="space-y-3">
                            {zone.baileys_status === 'connected' ? (
                              <div className="space-y-2">
                                <div className="text-xs text-green-600 font-hebrew text-center">✅ WhatsApp מחובר</div>
                                <Button size="sm" variant="outline" onClick={() => disconnectBaileys(zone)} className="w-full text-red-500 font-hebrew">
                                  נתק
                                </Button>
                              </div>
                            ) : qrMap[zone.id] ? (
                              <div className="flex flex-col items-center gap-2">
                                <p className="text-xs text-muted-foreground font-hebrew">סרקו עם WhatsApp ← מכשירים מקושרים ← קשר מכשיר</p>
                                <img src={qrMap[zone.id]} alt="QR" className="w-48 h-48 rounded-lg border" />
                                <p className="text-xs text-muted-foreground font-hebrew animate-pulse">ממתין לסריקה...</p>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => connectBaileys(zone)}
                                disabled={connectingBaileys === zone.id}
                                className="w-full font-hebrew"
                              >
                                {connectingBaileys === zone.id
                                  ? <><Loader2 className="w-4 h-4 animate-spin ml-1" />מחבר...</>
                                  : '📷 חבר עם QR'}
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Group selector */}
                        {zone.is_configured && (zone.platform || 'whatsapp') === 'whatsapp' && (
                          <div className="space-y-2 pt-1 border-t">
                            <div className="flex items-center justify-between">
                              <div className="text-xs text-muted-foreground font-hebrew">קבוצת יעד לשליחה</div>
                              <Button
                                variant="ghost" size="sm"
                                onClick={() => fetchGroups(zone.id)}
                                disabled={loadingGroups === zone.id}
                                className="text-xs h-7 font-hebrew"
                              >
                                {loadingGroups === zone.id
                                  ? <Loader2 className="w-3 h-3 animate-spin ml-1" />
                                  : <RefreshCw className="w-3 h-3 ml-1" />}
                                רענן קבוצות
                              </Button>
                            </div>

                            {groups.length > 0 ? (
                              <Select
                                value={zone.group_jid || ''}
                                onValueChange={v => {
                                  const g = groups.find(g => g.jid === v);
                                  if (g) setGroup(zone.id, g.jid, g.name);
                                }}
                              >
                                <SelectTrigger className="text-right font-hebrew">
                                  <SelectValue placeholder="בחר קבוצה" />
                                </SelectTrigger>
                                <SelectContent>
                                  {groups.map(g => (
                                    <SelectItem key={g.jid} value={g.jid} className="font-hebrew">{g.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <p className="text-xs text-muted-foreground font-hebrew">
                                {loadingGroups === zone.id
                                  ? 'טוען קבוצות...'
                                  : 'לחץ "רענן קבוצות" לטעינה'}
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* ── Schedule ── */}
                  <div className="border rounded-lg p-3 space-y-3">
                    <div className="font-medium text-sm font-hebrew">⏱ תזמון</div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground font-hebrew">מרווח (דקות)</label>
                        <Input
                          type="number" min={5} max={1440}
                          value={display.interval_minutes}
                          onChange={e => editSchedule(zone.id, { interval_minutes: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground font-hebrew">משעה</label>
                        <Input
                          type="time"
                          value={`${String(display.start_hour).padStart(2,'0')}:${String(display.start_minute ?? 0).padStart(2,'0')}`}
                          onChange={e => {
                            const [h, m] = e.target.value.split(':').map(Number);
                            editSchedule(zone.id, { start_hour: h, start_minute: m });
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground font-hebrew">עד שעה</label>
                        <Input
                          type="time"
                          value={`${String(display.end_hour).padStart(2,'0')}:${String(display.end_minute ?? 0).padStart(2,'0')}`}
                          onChange={e => {
                            const [h, m] = e.target.value.split(':').map(Number);
                            editSchedule(zone.id, { end_hour: h, end_minute: m });
                          }}
                        />
                      </div>
                    </div>

                    {/* Shabbat mode */}
                    <div className="border rounded-lg p-3 space-y-3 bg-blue-50/40 dark:bg-blue-950/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-base">🕍</span>
                          <div>
                            <div className="text-sm font-medium font-hebrew">מצב שבת</div>
                            <div className="text-xs text-muted-foreground font-hebrew">עצור שליחה בשישי-שבת</div>
                          </div>
                        </div>
                        <Switch
                          checked={!!(display.shabbat_mode ?? zone.shabbat_mode)}
                          onCheckedChange={v => editSchedule(zone.id, { shabbat_mode: v ? 1 : 0 })}
                        />
                      </div>
                      {!!(display.shabbat_mode ?? zone.shabbat_mode) && (
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground font-hebrew">עצור ביום שישי בשעה</label>
                            <Input
                              type="time"
                              value={`${String(display.shabbat_stop_hour ?? zone.shabbat_stop_hour ?? 18).padStart(2,'0')}:${String(display.shabbat_stop_minute ?? zone.shabbat_stop_minute ?? 0).padStart(2,'0')}`}
                              onChange={e => {
                                const [hh, mm] = e.target.value.split(':').map(Number);
                                editSchedule(zone.id, { shabbat_stop_hour: hh, shabbat_stop_minute: mm });
                              }}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground font-hebrew">חזור בשבת בשעה</label>
                            <Input
                              type="time"
                              value={`${String(display.shabbat_resume_hour ?? zone.shabbat_resume_hour ?? 22).padStart(2,'0')}:${String(display.shabbat_resume_minute ?? zone.shabbat_resume_minute ?? 0).padStart(2,'0')}`}
                              onChange={e => {
                                const [hh, mm] = e.target.value.split(':').map(Number);
                                editSchedule(zone.id, { shabbat_resume_hour: hh, shabbat_resume_minute: mm });
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {Object.keys(edits).length > 0 && (
                      <Button size="sm" onClick={() => saveSchedule(zone)} disabled={savingSchedule === zone.id} className="font-hebrew">
                        {savingSchedule === zone.id ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                        שמור תזמון
                      </Button>
                    )}

                    {/* Hour grid */}
                    <div>
                      <div className="text-xs text-muted-foreground font-hebrew mb-1">
                        לחץ על שעה פעילה לדלג עליה היום (חד-פעמי):
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {HOURS.map(h => {
                          const startMins = zone.start_hour * 60 + (zone.start_minute ?? 0);
                          const endMins = zone.end_hour * 60 + (zone.end_minute ?? 0);
                          const active = (h * 60 + 59) >= startMins && h * 60 < endMins;
                          const skipped = skipHours.includes(h);
                          return (
                            <button
                              key={h}
                              onClick={() => active && toggleSkipHour(zone.id, h)}
                              disabled={!active}
                              className={cn(
                                "w-8 h-8 text-xs rounded font-mono transition-colors",
                                !active && "opacity-20 cursor-default",
                                active && !skipped && "bg-green-500/20 hover:bg-green-500/40 text-green-700",
                                active && skipped && "bg-red-500/20 text-red-500 line-through"
                              )}
                            >
                              {h}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* ── Stack ── */}
                  <div className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm font-hebrew">📦 מחסנית פוסטים</div>
                      <div className="flex items-center gap-2">
                        {pendingReorder[zone.id] && (
                          <Button
                            size="sm"
                            onClick={() => saveOrder(zone.id)}
                            disabled={savingOrder === zone.id}
                            className="text-xs h-7 font-hebrew gap-1 bg-green-600 hover:bg-green-700 text-white"
                          >
                            {savingOrder === zone.id ? '...' : '💾 שמור סדר'}
                          </Button>
                        )}
                        <Button
                          variant="outline" size="sm"
                          onClick={() => openQueueDialog(zone.id)}
                          className="text-xs h-7 font-hebrew gap-1"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                          הוסף מתור
                        </Button>
                        <Badge variant="outline">{stackMap[zone.id]?.length ?? zone.stack_count} ממתינים</Badge>
                      </div>
                    </div>
                    {(stackMap[zone.id] || []).length === 0 && (
                      <div className="text-xs text-muted-foreground text-center py-2 font-hebrew">
                        המחסנית ריקה. הוסף פוסטים מ"שליחה ידנית" או "האזנה לקבוצות".
                      </div>
                    )}
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {(stackMap[zone.id] || []).map((item, idx) => {
                        const items = stackMap[zone.id] || [];
                        return (
                          <div key={item.id} className="flex items-center gap-1 bg-muted/40 hover:bg-muted/60 rounded px-2 py-1.5 text-xs transition-colors">
                            {/* Move buttons */}
                            <div className="flex flex-col shrink-0">
                              <button
                                disabled={idx === 0}
                                onClick={() => moveInStack(zone.id, idx, -1)}
                                className="text-muted-foreground hover:text-foreground disabled:opacity-20 leading-none"
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                disabled={idx === items.length - 1}
                                onClick={() => moveInStack(zone.id, idx, 1)}
                                className="text-muted-foreground hover:text-foreground disabled:opacity-20 leading-none"
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                            </div>
                            {/* Content */}
                            <button
                              className="flex-1 min-w-0 text-right hover:text-primary transition-colors"
                              onClick={() => { setPreviewItem(item); setPreviewZoneId(zone.id); setIsEditingPost(false); }}
                            >
                              <div className="truncate font-hebrew">{item.product?.hebrew_description?.slice(0, 55) || item.product?.title?.slice(0, 55) || 'פוסט'}</div>
                              <div className="text-muted-foreground text-[10px] mt-0.5">
                                {item.estimated_send_at ? fmtTime(item.estimated_send_at) : '—'}
                              </div>
                            </button>
                            <Button variant="ghost" size="icon" className="w-6 h-6 shrink-0 text-muted-foreground hover:text-primary" onClick={() => openEditPost(item, zone.id)}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="w-6 h-6 shrink-0" onClick={() => removeFromStack(zone.id, item.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Queue picker dialog */}
      <Dialog open={!!queueDialogZone} onOpenChange={open => { if (!open) setQueueDialogZone(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col" dir="rtl">
          <DialogHeader>
            <DialogTitle className="font-hebrew text-base">📥 הוסף מתור הפרסום</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            <Input
              placeholder="חיפוש..."
              value={queueSearch}
              onChange={e => {
                setQueueSearch(e.target.value);
                loadQueue(0, e.target.value);
              }}
              className="font-hebrew text-right"
            />
            <div className="overflow-y-auto flex-1 space-y-2 pl-1">
              {queueLoading && queueProducts.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : queueProducts.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8 font-hebrew">לא נמצאו פוסטים</div>
              ) : (
                <>
                  {queueProducts.map(product => {
                    const isAdding = addingToStack.has(product.id);
                    const isAdded = addedToStack.has(product.id);
                    const text = product.hebrew_description || product.title || '';
                    return (
                      <div key={product.id} className="flex items-center gap-2 border rounded-lg p-2 hover:bg-muted/40 transition-colors">
                        {product.image_url ? (
                          <img src={product.image_url} alt="" className="w-12 h-12 object-cover rounded shrink-0 bg-muted" />
                        ) : (
                          <div className="w-12 h-12 rounded bg-muted shrink-0 flex items-center justify-center">
                            <Package className="w-5 h-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 text-right">
                          <div className="text-xs font-hebrew leading-snug line-clamp-2">{text.slice(0, 100)}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(product.created_at).toLocaleDateString('he-IL')}
                            {product.status && <span className="mr-2 opacity-60">{product.status}</span>}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={isAdded ? 'outline' : 'default'}
                          disabled={isAdding}
                          onClick={() => queueDialogZone && addFromQueue(queueDialogZone, product)}
                          className="shrink-0 h-8 text-xs font-hebrew"
                        >
                          {isAdding ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : isAdded ? (
                            <><CheckCircle2 className="w-3 h-3 ml-1 text-green-500" />נוסף</>
                          ) : (
                            '+ הוסף'
                          )}
                        </Button>
                      </div>
                    );
                  })}
                  {queueHasMore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full font-hebrew text-xs"
                      disabled={queueLoading}
                      onClick={() => loadQueue(queueOffset + PAGE, queueSearch)}
                    >
                      {queueLoading ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                      טען עוד
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Post preview / edit dialog */}
      <Dialog open={!!previewItem} onOpenChange={open => { if (!open) { setPreviewItem(null); setIsEditingPost(false); } }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="font-hebrew text-base">
                {isEditingPost ? '✏️ עריכת פוסט' : 'תצוגת פוסט'}
              </DialogTitle>
              {!isEditingPost && previewItem && (
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs font-hebrew gap-1"
                  onClick={() => openEditPost(previewItem, previewZoneId!)}
                >
                  <Pencil className="w-3 h-3" />
                  ערוך
                </Button>
              )}
            </div>
          </DialogHeader>
          {previewItem && (
            <div className="space-y-3">
              {previewItem.product?.image_url && (
                <img
                  src={previewItem.product.image_url}
                  alt=""
                  className="w-full max-h-48 object-contain rounded-lg bg-muted"
                />
              )}

              {isEditingPost ? (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-hebrew">תוכן הפוסט</label>
                    <Textarea
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      className="min-h-[200px] text-right font-hebrew text-sm leading-relaxed"
                      dir="rtl"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-hebrew">קישור שותפים</label>
                    <input
                      value={editAffLink}
                      onChange={e => setEditAffLink(e.target.value)}
                      className="w-full text-xs font-mono border rounded px-2 py-1.5 bg-background"
                      dir="ltr"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm" className="flex-1 font-hebrew gap-1"
                      onClick={savePostEdit}
                      disabled={savingPost}
                    >
                      {savingPost ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      שמור
                    </Button>
                    <Button
                      size="sm" variant="outline" className="font-hebrew gap-1"
                      onClick={() => setIsEditingPost(false)}
                      disabled={savingPost}
                    >
                      <X className="w-3 h-3" />
                      ביטול
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-hebrew whitespace-pre-wrap leading-relaxed">
                    {previewItem.product?.hebrew_description || previewItem.product?.title || 'אין תוכן'}
                  </p>
                  {previewItem.product?.affiliate_link && (
                    <a
                      href={previewItem.product.affiliate_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      קישור לרכישה
                    </a>
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

    </MainLayout>
  );
}
