import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DollarSign, ShoppingCart, CheckCircle2, TrendingUp, RefreshCw,
  Calendar, Package, AlertTriangle, Loader2, Plus, Trophy,
  Bell, BellRing, Settings2, Zap,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatProductLink } from "@/lib/ctaUtils";

type Period = "last_week" | "current_month" | "last_month";

type OrderItem = {
  order_number: string;
  product_title: string;
  product_id: string;
  paid_amount: number;
  commission: number;
  finished_commission: number;
  status: string;
  created_time: string;
  item_count: number;
};

type EarningsResponse = {
  success: boolean;
  error?: string;
  summary: {
    paid_orders: number;
    paid_earnings: number;
    completed_orders: number;
    completed_earnings: number;
  };
  orders: OrderItem[];
  period: { start: string; end: string; label: string };
};

const periodLabels: Record<Period, string> = {
  last_week: "7 ימים אחרונים",
  current_month: "חודש נוכחי",
  last_month: "חודש שעבר",
};

const COMPLETED_STATUSES = ["buyer confirmed receipt", "completed", "success"];
const PAID_STATUSES = ["payment completed", "pay"];

function getStatusBadge(status: string) {
  const lower = status.toLowerCase();
  if (COMPLETED_STATUSES.some((s) => lower.includes(s))) {
    return <Badge variant="success">הושלם</Badge>;
  }
  if (PAID_STATUSES.some((s) => lower.includes(s))) {
    return <Badge variant="default">שולם</Badge>;
  }
  return <Badge variant="warning">{status || "ממתין"}</Badge>;
}

function formatHebrewDate(dateStr: string): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr.replace(" ", "T"));
    return d.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr.substring(0, 10);
  }
}

function buildAliUrl(productId: string): string {
  return `https://www.aliexpress.com/item/${productId}.html`;
}

async function fetchEarnings(period: Period): Promise<EarningsResponse> {
  const { data, error } = await supabase.functions.invoke("get-affiliate-earnings", {
    body: { period },
  });
  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || "Failed to fetch earnings");
  return data;
}

const EarningsDashboard = () => {
  const [period, setPeriod] = useState<Period>("last_week");
  const [addingProductIds, setAddingProductIds] = useState<Set<string>>(new Set());

  // Notification settings state
  const [notifSettings, setNotifSettings] = useState({
    is_enabled: false,
    telegram_chat_id: "",
    notify_per_order: true,
    notify_daily_report: true,
  });
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);

  // Live orders state
  const [liveOrders, setLiveOrders] = useState<any[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);

  // Fetch notification settings
  useEffect(() => {
    const fetchNotifSettings = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("earnings_notification_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data) {
        setNotifSettings({
          is_enabled: data.is_enabled,
          telegram_chat_id: data.telegram_chat_id || "",
          notify_per_order: data.notify_per_order,
          notify_daily_report: data.notify_daily_report,
        });
      }
    };
    fetchNotifSettings();
  }, []);

  // Fetch live orders (last 24h from tracked_orders)
  useEffect(() => {
    const fetchLiveOrders = async () => {
      setLiveLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLiveLoading(false); return; }

      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("tracked_orders")
        .select("*")
        .eq("user_id", user.id)
        .gte("created_at", yesterday)
        .order("created_at", { ascending: false });

      setLiveOrders(data || []);
      setLiveLoading(false);
    };
    fetchLiveOrders();

    // Refresh every 5 minutes
    const interval = setInterval(fetchLiveOrders, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSaveNotifSettings = async () => {
    setNotifSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("earnings_notification_settings")
        .upsert({
          user_id: user.id,
          ...notifSettings,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (error) throw error;
      toast({ title: "✅ הגדרות התראות נשמרו!" });
    } catch (err) {
      toast({
        title: "שגיאה בשמירה",
        description: err instanceof Error ? err.message : "שגיאה",
        variant: "destructive",
      });
    } finally {
      setNotifSaving(false);
    }
  };

  const handleManualSync = async () => {
    setLiveLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-live-orders");
      if (error) throw error;
      toast({ title: "✅ סנכרון הושלם!", description: `${data?.results?.[0]?.new_orders || 0} הזמנות חדשות` });

      // Refresh live orders
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: orders } = await supabase
          .from("tracked_orders")
          .select("*")
          .eq("user_id", user.id)
          .gte("created_at", yesterday)
          .order("created_at", { ascending: false });
        setLiveOrders(orders || []);
      }
    } catch (err) {
      toast({ title: "שגיאה בסנכרון", variant: "destructive" });
    } finally {
      setLiveLoading(false);
    }
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["affiliate-earnings", period],
    queryFn: () => fetchEarnings(period),
    staleTime: 2 * 60 * 1000,
    enabled: true,
  });

  const summary = data?.summary;
  const orders = data?.orders || [];
  const spinning = isLoading || isFetching;

  // Aggregate top 5 best-selling products by total sales (item_count) across orders
  const topProducts = useMemo(() => {
    const map = new Map<string, { product_id: string; product_title: string; total_sales: number; total_commission: number; total_amount: number }>();
    for (const o of orders) {
      if (!o.product_id) continue;
      const existing = map.get(o.product_id);
      if (existing) {
        existing.total_sales += o.item_count;
        existing.total_commission += o.commission;
        existing.total_amount += o.paid_amount;
      } else {
        map.set(o.product_id, {
          product_id: o.product_id,
          product_title: o.product_title,
          total_sales: o.item_count,
          total_commission: o.commission,
          total_amount: o.paid_amount,
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.total_sales - a.total_sales)
      .slice(0, 5);
  }, [orders]);

  const handleAddToQueue = async (order: OrderItem) => {
    if (!order.product_id || addingProductIds.has(order.product_id)) return;

    const productId = order.product_id;
    setAddingProductIds((prev) => new Set(prev).add(productId));

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const productUrl = buildAliUrl(productId);

      // Step 1: Fetch product metadata
      const { data: metaResp, error: metaErr } = await supabase.functions.invoke("fetch-ali-product", {
        body: { productUrl },
      });
      if (metaErr || !metaResp?.success) {
        throw new Error(metaResp?.error || "Failed to fetch product data");
      }

      const meta = metaResp.data as {
        title: string;
        price: number;
        image_url: string;
        orders_count: number;
        rating: number;
      };
      const cleanUrl = metaResp.cleanUrl as string;

      // Step 2: Generate affiliate link
      const { data: affResp, error: affErr } = await supabase.functions.invoke("generate-affiliate-link", {
        body: { productUrl: cleanUrl || productUrl, userId: user.id },
      });
      if (affErr) throw new Error(affErr.message);
      const affiliateLink = affResp?.success ? (affResp.affiliateLink as string) : (cleanUrl || productUrl);

      // Step 3: Generate Hebrew description
      const { data: hebResp, error: hebErr } = await supabase.functions.invoke("generate-hebrew-post", {
        body: {
          title: meta.title,
          ordersCount: meta.orders_count,
          rating: meta.rating,
          userId: user.id,
        },
      });
      if (hebErr || !hebResp?.success) {
        throw new Error(hebResp?.error || "Failed to generate Hebrew post");
      }

      const aiDescription = hebResp.hebrewDescription as string;
      const hebrewDescription = `${aiDescription}\n\n${formatProductLink(affiliateLink)}`;

      // Normalize rating
      let normalizedRating = meta.rating ?? 0;
      if (normalizedRating > 5) normalizedRating = normalizedRating / 20;

      // Step 4: Save to products table
      const { error: insertErr } = await supabase.from("products").insert({
        original_url: cleanUrl || productUrl,
        title: meta.title,
        price: meta.price ?? 0,
        image_url: meta.image_url || null,
        orders_count: meta.orders_count ?? 0,
        rating: Math.min(normalizedRating, 5),
        affiliate_link: affiliateLink || null,
        hebrew_description: hebrewDescription || null,
        status: "Scheduled",
        channels: [],
        user_id: user.id,
        sent_via: "manual",
      });

      if (insertErr) throw new Error(insertErr.message);

      toast({
        title: "✅ נוסף למחסנית!",
        description: `${meta.title.substring(0, 50)}...`,
      });
    } catch (err) {
      toast({
        title: "שגיאה בהוספה למחסנית",
        description: err instanceof Error ? err.message : "שגיאה לא ידועה",
        variant: "destructive",
      });
    } finally {
      setAddingProductIds((prev) => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              <span className="gradient-text">דשבורד רווחים</span>
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              מעקב הזמנות בזמן אמת + סיכום רווחים מפורטל השיווק של AliExpress
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(Object.keys(periodLabels) as Period[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(p)}
                disabled={spinning}
                className="gap-1.5"
              >
                <Calendar className="h-3.5 w-3.5" />
                {periodLabels[p]}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={spinning}
            >
              <RefreshCw className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Live Orders + Notification Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Live Orders Card */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                הזמנות Live (24 שעות)
              </CardTitle>
              <Button variant="outline" size="sm" onClick={handleManualSync} disabled={liveLoading} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${liveLoading ? "animate-spin" : ""}`} />
                סנכרון
              </Button>
            </CardHeader>
            <CardContent>
              {liveLoading && liveOrders.length === 0 ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">טוען...</span>
                </div>
              ) : liveOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Package className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-muted-foreground text-sm">אין הזמנות חדשות ב-24 שעות אחרונות</p>
                  <p className="text-muted-foreground/60 text-xs">הפעל התראות כדי לקבל עדכונים אוטומטיים</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {liveOrders
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((order, idx) => {
                    const productLink = order.product_id ? `https://www.aliexpress.com/item/${order.product_id}.html` : null;
                    return (
                    <div key={order.id || idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
                      <div className="flex-1 min-w-0">
                        {productLink ? (
                          <a href={productLink} target="_blank" rel="noopener noreferrer" className="text-sm font-medium truncate block text-primary hover:underline">
                            {order.product_title || `הזמנה #${order.order_id}`}
                          </a>
                        ) : (
                          <p className="text-sm font-medium truncate">{order.product_title || `הזמנה #${order.order_id}`}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {order.order_status} • {new Date(order.created_at).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                        </p>
                      </div>
                      <div className="text-left mr-3">
                        <p className="text-sm font-bold text-primary">${(parseFloat(order.estimated_commission) || 0).toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">${(parseFloat(order.paid_amount) || 0).toFixed(2)}</p>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notification Settings Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BellRing className="h-5 w-5 text-primary" />
                  התראות
                </CardTitle>
                <Switch
                  checked={notifSettings.is_enabled}
                  onCheckedChange={(checked) => setNotifSettings(prev => ({ ...prev, is_enabled: checked }))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Chat ID טלגרם</Label>
                  <Input
                    placeholder="הזן Chat ID לקבלת התראות"
                    value={notifSettings.telegram_chat_id}
                    onChange={(e) => setNotifSettings(prev => ({ ...prev, telegram_chat_id: e.target.value }))}
                    className="text-sm"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">סוג התראות</Label>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="notify_per_order"
                      checked={notifSettings.notify_per_order}
                      onCheckedChange={(checked) => setNotifSettings(prev => ({ ...prev, notify_per_order: !!checked }))}
                    />
                    <label htmlFor="notify_per_order" className="text-sm cursor-pointer">הודעה על כל הזמנה</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="notify_daily"
                      checked={notifSettings.notify_daily_report}
                      onCheckedChange={(checked) => setNotifSettings(prev => ({ ...prev, notify_daily_report: !!checked }))}
                    />
                    <label htmlFor="notify_daily" className="text-sm cursor-pointer">דו"ח יומי (09:00)</label>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSaveNotifSettings}
                disabled={notifSaving}
                className="w-full gap-2"
                size="sm"
              >
                {notifSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                שמור הגדרות
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Error State */}
        {error && !isLoading && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="flex flex-col items-center justify-center py-10 gap-4">
              <AlertTriangle className="h-10 w-10 text-destructive" />
              <p className="text-destructive font-medium text-center">
                {error instanceof Error ? error.message : "שגיאה בטעינת נתונים"}
              </p>
              <Button variant="outline" onClick={() => refetch()}>
                נסה שוב
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Loading Skeleton */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-2 w-full mt-3" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Summary Cards */}
        {summary && !isLoading && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="הזמנות ששולמו" value={summary.paid_orders} icon={ShoppingCart} />
              <StatCard
                title="רווח משוער (USD)"
                value={`$${summary.paid_earnings.toFixed(2)}`}
                icon={DollarSign}
                highlight
              />
              <StatCard title="הזמנות שהושלמו" value={summary.completed_orders} icon={CheckCircle2} />
              <StatCard
                title="רווח שהושלם (USD)"
                value={`$${summary.completed_earnings.toFixed(2)}`}
                icon={TrendingUp}
                highlight
              />
            </div>

            {/* Top 5 Best Sellers */}
            {topProducts.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-primary" />
                    טופ 5 מוצרים הכי נמכרים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {topProducts.map((tp, idx) => {
                      const isAdding = addingProductIds.has(tp.product_id);
                      const aliUrl = buildAliUrl(tp.product_id);
                      const orderForQueue: OrderItem = {
                        order_number: "",
                        product_title: tp.product_title,
                        product_id: tp.product_id,
                        paid_amount: tp.total_amount,
                        commission: tp.total_commission,
                        finished_commission: 0,
                        status: "",
                        created_time: "",
                        item_count: tp.total_sales,
                      };

                      return (
                        <Card key={tp.product_id} className="relative overflow-hidden border-muted">
                          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                            {idx + 1}
                          </div>
                          <CardContent className="pt-8 pb-3 px-3 space-y-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <a
                                  href={aliUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-primary hover:underline line-clamp-2 block leading-tight"
                                >
                                  {tp.product_title || `מוצר #${tp.product_id}`}
                                </a>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                {tp.product_title}
                              </TooltipContent>
                            </Tooltip>

                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{tp.total_sales} מכירות</span>
                              <span className="text-success font-semibold">${tp.total_commission.toFixed(2)}</span>
                            </div>

                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full h-7 text-xs gap-1"
                              disabled={isAdding}
                              onClick={() => handleAddToQueue(orderForQueue)}
                            >
                              {isAdding ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Plus className="h-3 w-3" />
                              )}
                              הוסף למחסנית
                            </Button>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Orders Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  מוצרים שנמכרו
                </CardTitle>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Package className="h-12 w-12 text-muted-foreground/30" />
                    <p className="text-muted-foreground">לא נמצאו מכירות בתקופה שנבחרה</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">מוצר</TableHead>
                          <TableHead className="text-right">מספר הזמנה</TableHead>
                          <TableHead className="text-right">סכום</TableHead>
                          <TableHead className="text-right">עמלה</TableHead>
                          <TableHead className="text-right">סטטוס</TableHead>
                          <TableHead className="text-right">תאריך</TableHead>
                          <TableHead className="text-right w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map((order, idx) => {
                          const isAdding = addingProductIds.has(order.product_id);
                          const aliUrl = order.product_id ? buildAliUrl(order.product_id) : null;

                          return (
                            <TableRow key={`${order.order_number}_${idx}`}>
                              <TableCell className="max-w-[220px]">
                                {aliUrl ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <a
                                        href={aliUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-primary hover:underline truncate block"
                                      >
                                        {order.product_title || aliUrl}
                                      </a>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-xs text-xs">
                                      {order.product_title || order.product_id}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span className="text-sm truncate block text-muted-foreground">
                                    {order.product_title || `מוצר #${order.product_id}`}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <span className="font-mono text-xs text-muted-foreground">
                                  {order.order_number}
                                </span>
                              </TableCell>
                              <TableCell className="font-medium">
                                ${order.paid_amount.toFixed(2)}
                              </TableCell>
                              <TableCell className="font-semibold text-success">
                                ${order.commission.toFixed(2)}
                              </TableCell>
                              <TableCell>{getStatusBadge(order.status)}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {formatHebrewDate(order.created_time)}
                              </TableCell>
                              <TableCell>
                                {order.product_id && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        disabled={isAdding}
                                        onClick={() => handleAddToQueue(order)}
                                      >
                                        {isAdding ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Plus className="h-3.5 w-3.5" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">הוספה למחסנית</TooltipContent>
                                  </Tooltip>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Loading spinner for table during refetch */}
        {isFetching && !isLoading && (
          <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">טוען נתונים...</span>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

function StatCard({
  title,
  value,
  icon: Icon,
  highlight,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  highlight?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${highlight ? "text-primary" : "text-foreground"}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export default EarningsDashboard;
