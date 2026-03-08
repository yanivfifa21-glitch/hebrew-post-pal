import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StockBadge } from "@/components/products/StockBadge";
import {
  Plus, Trash2, Loader2, Eye, EyeOff, Check, X, Edit,
  Headphones, Copy, Settings, Wifi, WifiOff, Filter,
  CheckCircle, XCircle, Link, Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CapturedPost, RelayGroup } from "@/types/product";
import { format } from "date-fns";

const GroupListener = () => {
  const [groups, setGroups] = useState<RelayGroup[]>([]);
  const [capturedPosts, setCapturedPosts] = useState<CapturedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [newBotToken, setNewBotToken] = useState("");
  const [newAutoApprove, setNewAutoApprove] = useState(false);
  const [newPrepend, setNewPrepend] = useState("");
  const [newAppend, setNewAppend] = useState("");
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [postFilter, setPostFilter] = useState<string>("pending_review");
  const [editingPost, setEditingPost] = useState<CapturedPost | null>(null);
  const [editText, setEditText] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [isApproving, setIsApproving] = useState<string | null>(null);
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [settingUpWebhook, setSettingUpWebhook] = useState<string | null>(null);
  const [showBotToken, setShowBotToken] = useState<Record<string, boolean>>({});
  const [editingGroup, setEditingGroup] = useState<RelayGroup | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editBotToken, setEditBotToken] = useState("");
  const [editAutoApprove, setEditAutoApprove] = useState(false);
  const [editGroupActive, setEditGroupActive] = useState(true);
  const [editPrepend, setEditPrepend] = useState("");
  const [editAppend, setEditAppend] = useState("");
  const [isUpdatingGroup, setIsUpdatingGroup] = useState(false);

  useEffect(() => {
    fetchGroups();
    fetchCapturedPosts();
    const cleanup = setupRealtime();
    return cleanup;
  }, []);

  useEffect(() => {
    fetchCapturedPosts();
  }, [postFilter]);

  const setupRealtime = () => {
    const channel = supabase
      .channel("captured-posts-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "captured_posts" }, (payload) => {
        const newPost = payload.new as CapturedPost;
        setCapturedPosts((prev) => [newPost, ...prev]);
        toast({ title: "📬 פוסט חדש נקלט!" });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  };

  const fetchGroups = async () => {
    try {
      const { data, error } = await supabase
        .from("relay_groups")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setGroups((data || []) as unknown as RelayGroup[]);
    } catch (e) {
      console.error("Error fetching groups:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCapturedPosts = async () => {
    setIsLoadingPosts(true);
    try {
      let query = supabase
        .from("captured_posts")
        .select("*, relay_groups(group_name)")
        .order("captured_at", { ascending: false })
        .limit(100);
      if (postFilter !== "all") {
        query = query.eq("status", postFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      setCapturedPosts((data || []) as unknown as CapturedPost[]);
    } catch (e) {
      console.error("Error fetching posts:", e);
    } finally {
      setIsLoadingPosts(false);
    }
  };


  const handleAddGroup = async () => {
    if (!newGroupName || !newGroupId) {
      toast({ title: "נא למלא שם וID של הקבוצה", variant: "destructive" });
      return;
    }
    setIsSavingGroup(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("relay_groups").insert({
        user_id: user.id,
        group_name: newGroupName,
        telegram_group_id: newGroupId,
        bot_token: newBotToken || null,
        auto_approve: newAutoApprove,
        text_template_prepend: newPrepend || null,
        text_template_append: newAppend || null,
      } as any);
      if (error) throw error;
      toast({ title: "✅ קבוצת ממסר נוספה בהצלחה" });
      setShowAddGroup(false);
      setNewGroupName(""); setNewGroupId(""); setNewBotToken(""); setNewAutoApprove(false); setNewPrepend(""); setNewAppend("");
      fetchGroups();
    } catch {
      toast({ title: "שגיאה בהוספת קבוצה", variant: "destructive" });
    } finally {
      setIsSavingGroup(false);
    }
  };

  const openEditGroupDialog = (group: RelayGroup) => {
    setEditingGroup(group);
    setEditGroupName(group.group_name || "");
    setEditGroupId(group.telegram_group_id || "");
    setEditBotToken(group.bot_token || "");
    setEditAutoApprove(Boolean(group.auto_approve));
    setEditGroupActive(Boolean(group.is_active));
    setEditPrepend(group.text_template_prepend || "");
    setEditAppend(group.text_template_append || "");
  };

  const handleSaveGroupChanges = async () => {
    if (!editingGroup) return;
    if (!editGroupName.trim() || !editGroupId.trim()) {
      toast({ title: "נא למלא שם וID של הקבוצה", variant: "destructive" });
      return;
    }

    setIsUpdatingGroup(true);
    try {
      const payload = {
        group_name: editGroupName.trim(),
        telegram_group_id: editGroupId.trim(),
        bot_token: editBotToken.trim() || null,
        auto_approve: editAutoApprove,
        is_active: editGroupActive,
        text_template_prepend: editPrepend.trim() || null,
        text_template_append: editAppend.trim() || null,
      };

      const { data, error } = await supabase
        .from("relay_groups")
        .update(payload)
        .eq("id", editingGroup.id)
        .select("*")
        .single();

      if (error) throw error;

      setGroups((prev) => prev.map((g) => (g.id === editingGroup.id ? (data as unknown as RelayGroup) : g)));
      setEditingGroup(null);
      toast({ title: "✅ הקבוצה עודכנה" });
    } catch {
      toast({ title: "שגיאה בשמירת הקבוצה", variant: "destructive" });
    } finally {
      setIsUpdatingGroup(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await supabase.from("relay_groups").delete().eq("id", id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      toast({ title: "קבוצה נמחקה" });
    } catch {
      toast({ title: "שגיאה במחיקה", variant: "destructive" });
    }
  };

  const handleToggleGroup = async (id: string, isActive: boolean) => {
    await supabase.from("relay_groups").update({ is_active: isActive }).eq("id", id);
    setGroups((prev) => prev.map((g) => g.id === id ? { ...g, is_active: isActive } : g));
  };

  const handleToggleAutoApprove = async (id: string, autoApprove: boolean) => {
    await supabase.from("relay_groups").update({ auto_approve: autoApprove }).eq("id", id);
    setGroups((prev) => prev.map((g) => g.id === id ? { ...g, auto_approve: autoApprove } : g));
  };

  const handleSetupWebhook = async (groupId: string) => {
    setSettingUpWebhook(groupId);
    try {
      const { data, error } = await supabase.functions.invoke("setup-telegram-webhook", {
        body: { groupId, action: "set" },
      });
      if (error) throw error;
      if (data?.success) {
        setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, webhook_active: true } : g));
        toast({ title: "✅ Webhook הופעל בהצלחה" });
      } else {
        toast({ title: "שגיאה בהפעלת Webhook", description: data?.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "שגיאה בהפעלת Webhook", variant: "destructive" });
    } finally {
      setSettingUpWebhook(null);
    }
  };

  const handleRemoveWebhook = async (groupId: string) => {
    setSettingUpWebhook(groupId);
    try {
      const { data, error } = await supabase.functions.invoke("setup-telegram-webhook", {
        body: { groupId, action: "remove" },
      });
      if (error) throw error;
      setGroups((prev) => prev.map((g) => g.id === groupId ? { ...g, webhook_active: false } : g));
      toast({ title: "Webhook הוסר" });
    } catch {
      toast({ title: "שגיאה בהסרת Webhook", variant: "destructive" });
    } finally {
      setSettingUpWebhook(null);
    }
  };

  const handleApprovePost = async (post: CapturedPost) => {
    setIsApproving(post.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const productTitle = (post.modified_text || post.original_text || "").substring(0, 100) || "Captured Product";
      const { data: product, error: productError } = await supabase
        .from("products")
        .insert({
          user_id: user.id,
          title: productTitle,
          original_url: post.original_url || "",
          affiliate_link: post.modified_url || null,
          image_url: post.image_url || null,
          hebrew_description: post.modified_text || post.original_text || null,
          status: "Scheduled",
          sent_via: "auto",
        })
        .select()
        .single();
      if (productError) throw productError;
      await supabase
        .from("captured_posts")
        .update({ status: "queued", product_id: product.id, reviewed_at: new Date().toISOString() })
        .eq("id", post.id);
      setCapturedPosts((prev) => prev.map((p) =>
        p.id === post.id ? { ...p, status: "queued" as const, product_id: product.id } : p
      ));
      toast({ title: "✅ אושר והועבר לתור" });
    } catch {
      toast({ title: "שגיאה באישור", variant: "destructive" });
    } finally {
      setIsApproving(null);
    }
  };

  const handleRejectPost = async (postId: string) => {
    await supabase
      .from("captured_posts")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", postId);
    setCapturedPosts((prev) => prev.map((p) =>
      p.id === postId ? { ...p, status: "rejected" as const } : p
    ));
    toast({ title: "נדחה" });
  };

  const handleBulkApprove = async () => {
    const pendingPosts = capturedPosts.filter((p) => p.status === "pending_review");
    if (pendingPosts.length === 0) return;
    setIsBulkApproving(true);
    let count = 0;
    for (const post of pendingPosts) {
      try { await handleApprovePost(post); count++; } catch {}
    }
    setIsBulkApproving(false);
    toast({ title: `✅ אושרו ${count} פוסטים` });
  };

  const handleSaveEdit = async () => {
    if (!editingPost) return;
    await supabase
      .from("captured_posts")
      .update({ modified_text: editText, modified_url: editUrl })
      .eq("id", editingPost.id);
    setCapturedPosts((prev) => prev.map((p) =>
      p.id === editingPost.id ? { ...p, modified_text: editText, modified_url: editUrl } : p
    ));
    setEditingPost(null);
    toast({ title: "✅ נשמר" });
  };


  const pendingCount = capturedPosts.filter((p) => p.status === "pending_review").length;

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending_review": return "ממתין";
      case "approved": return "אושר";
      case "rejected": return "נדחה";
      case "queued": return "בתור";
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending_review": return "bg-warning/20 text-warning";
      case "approved": return "bg-success/20 text-success";
      case "rejected": return "bg-destructive/20 text-destructive";
      case "queued": return "bg-primary/20 text-primary";
      default: return "";
    }
  };

  const maskToken = (token: string | null) => {
    if (!token) return "לא הוגדר";
    return token.slice(0, 6) + "•••" + token.slice(-4);
  };

  return (
    <MainLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-secondary to-accent flex items-center justify-center shadow-glow-sm">
                <Headphones className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-3xl font-bold">
                <span className="gradient-text">האזנה לקבוצות</span>
              </h1>
              {pendingCount > 0 && (
                <Badge className="bg-warning text-warning-foreground">{pendingCount} ממתינים</Badge>
              )}
            </div>
            <p className="text-muted-foreground">קלוט פוסטים מקבוצות ממסר בטלגרם והוסף אותם לתור עם הקישורים שלך</p>
          </div>
        </div>

        <Tabs defaultValue="posts" className="space-y-6">
          <TabsList className="bg-muted/30 p-1.5 rounded-xl border border-border/50 backdrop-blur-sm">
            <TabsTrigger value="posts" className="gap-2 rounded-lg">
              <Filter className="h-4 w-4" />
              פוסטים שנקלטו
              {pendingCount > 0 && (
                <span className="bg-warning/20 text-warning text-xs font-bold px-2 py-0.5 rounded-full">{pendingCount}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="groups" className="gap-2 rounded-lg">
              <Headphones className="h-4 w-4" />
              קבוצות ממסר
              <span className="bg-primary/20 text-primary text-xs font-bold px-2 py-0.5 rounded-full">{groups.length}</span>
            </TabsTrigger>
          </TabsList>

          {/* CAPTURED POSTS TAB */}
          <TabsContent value="posts" className="space-y-4">
            <div className="flex gap-2 flex-wrap items-center">
              {["pending_review", "approved", "rejected", "queued", "all"].map((status) => (
                <Button
                  key={status}
                  variant={postFilter === status ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPostFilter(status)}
                  className="gap-1"
                >
                  {status === "pending_review" && "⏳ ממתין לאישור"}
                  {status === "approved" && "✅ אושר"}
                  {status === "rejected" && "❌ נדחה"}
                  {status === "queued" && "📋 בתור"}
                  {status === "all" && "🔄 הכל"}
                </Button>
              ))}
              {postFilter === "pending_review" && capturedPosts.filter(p => p.status === "pending_review").length > 0 && (
                <Button
                  variant="gradient"
                  size="sm"
                  onClick={handleBulkApprove}
                  disabled={isBulkApproving}
                  className="gap-1 mr-auto"
                >
                  {isBulkApproving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                  אשר הכל ({capturedPosts.filter(p => p.status === "pending_review").length})
                </Button>
              )}
            </div>

            {isLoadingPosts ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : capturedPosts.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Headphones className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">אין פוסטים שנקלטו</h3>
                  <p className="text-muted-foreground text-sm">הגדר קבוצת ממסר והפעל Webhook כדי להתחיל לקלוט פוסטים</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {capturedPosts.map((post) => (
                  <Card key={post.id} className="glass-card overflow-hidden">
                    <div className="flex flex-col md:flex-row">
                      {post.image_url && (
                        <div className="w-full md:w-40 h-40 flex-shrink-0 overflow-hidden">
                          <img src={post.image_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 p-4 space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={getStatusColor(post.status)}>{getStatusLabel(post.status)}</Badge>
                          {(post as any).relay_groups?.group_name && (
                            <Badge variant="outline" className="text-xs">
                              📡 {(post as any).relay_groups.group_name}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground mr-auto">
                            {format(new Date(post.captured_at), "dd/MM/yyyy HH:mm")}
                          </span>
                        </div>
                        {post.original_text && (
                          <div className="bg-muted/30 rounded-lg p-3 text-sm text-muted-foreground" dir="rtl">
                            <p className="line-clamp-3">{post.original_text}</p>
                          </div>
                        )}
                        {post.modified_text && post.modified_text !== post.original_text && (
                          <div className="bg-primary/5 rounded-lg p-3 text-sm border border-primary/20" dir="rtl">
                            <p className="line-clamp-3">{post.modified_text}</p>
                          </div>
                        )}
                        <div className="flex flex-col gap-1 text-xs">
                          {post.original_url && (
                            <div className="flex items-center gap-1 text-destructive line-through truncate" dir="ltr">
                              <XCircle className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{post.original_url}</span>
                            </div>
                          )}
                          {post.modified_url && (
                            <div className="flex items-center gap-1 text-success truncate" dir="ltr">
                              <CheckCircle className="h-3 w-3 flex-shrink-0" />
                              <a href={post.modified_url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                                {post.modified_url}
                              </a>
                            </div>
                          )}
                        </div>
                        {post.status === "pending_review" && (
                          <div className="flex gap-2 flex-wrap">
                            <Button variant="gradient" size="sm" onClick={() => handleApprovePost(post)} disabled={isApproving === post.id} className="gap-1">
                              {isApproving === post.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              אשר והוסף לתור
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => { setEditingPost(post); setEditText(post.modified_text || post.original_text || ""); setEditUrl(post.modified_url || post.original_url || ""); }} className="gap-1">
                              <Edit className="h-3 w-3" />
                              ערוך
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleRejectPost(post.id)} className="gap-1 text-destructive hover:text-destructive">
                              <X className="h-3 w-3" />
                              דחה
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* RELAY GROUPS TAB */}
          <TabsContent value="groups" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">קבוצות ממסר</h2>
              <Dialog open={showAddGroup} onOpenChange={setShowAddGroup}>
                <DialogTrigger asChild>
                  <Button variant="gradient" className="gap-2">
                    <Plus className="h-4 w-4" />
                    הוסף קבוצת ממסר
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md" dir="rtl">
                  <DialogHeader>
                    <DialogTitle>הוסף קבוצת ממסר</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>שם הקבוצה</Label>
                      <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="למשל: ממסר דילים" className="mt-1" />
                    </div>
                    <div>
                      <Label>Telegram Group ID</Label>
                      <Input value={newGroupId} onChange={(e) => setNewGroupId(e.target.value)} placeholder="-1001234567890" dir="ltr" className="mt-1" />
                      <p className="text-xs text-muted-foreground mt-1">שלח הודעה בקבוצה, העבר ל-@userinfobot לקבלת ה-ID</p>
                    </div>
                    <div>
                      <Label>Bot Token</Label>
                      <Input value={newBotToken} onChange={(e) => setNewBotToken(e.target.value)} placeholder="123456:ABC-DEF..." dir="ltr" className="mt-1" type="password" />
                      <p className="text-xs text-muted-foreground mt-1">טוקן הבוט שהוא אדמין בקבוצת הממסר (מ-@BotFather)</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={newAutoApprove} onCheckedChange={setNewAutoApprove} />
                      <Label>אישור אוטומטי (פוסטים יועברו ישירות לתור)</Label>
                    </div>
                    <div>
                      <Label>טקסט לפני הפוסט (אופציונלי)</Label>
                      <Input value={newPrepend} onChange={(e) => setNewPrepend(e.target.value)} placeholder="🔥 מבצע חם!" className="mt-1" />
                    </div>
                    <div>
                      <Label>טקסט אחרי הפוסט (אופציונלי)</Label>
                      <Input value={newAppend} onChange={(e) => setNewAppend(e.target.value)} placeholder="👉 הצטרפו לערוץ שלנו" className="mt-1" />
                    </div>
                    <Button variant="gradient" className="w-full" onClick={handleAddGroup} disabled={isSavingGroup}>
                      {isSavingGroup ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                      הוסף קבוצה
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : groups.length === 0 ? (
              <Card className="glass-card">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Headphones className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">אין קבוצות ממסר</h3>
                  <p className="text-muted-foreground text-sm">הוסף קבוצת ממסר עם בוט טלגרם כדי להתחיל לקלוט פוסטים</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {groups.map((group) => (
                  <Card key={group.id} className="glass-card">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{group.group_name}</CardTitle>
                          {group.webhook_active ? (
                            <Badge className="bg-success/20 text-success gap-1"><Wifi className="h-3 w-3" />מחובר</Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-muted-foreground"><WifiOff className="h-3 w-3" />לא מחובר</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditGroupDialog(group)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteGroup(group.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <CardDescription dir="ltr" className="text-xs">{group.telegram_group_id}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Bot Token */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Bot Token:</span>
                        <code className="bg-muted/50 px-2 py-0.5 rounded text-xs" dir="ltr">
                          {showBotToken[group.id] ? (group.bot_token || "לא הוגדר") : maskToken(group.bot_token)}
                        </code>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowBotToken(prev => ({ ...prev, [group.id]: !prev[group.id] }))}>
                          {showBotToken[group.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                        {group.bot_token && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(group.bot_token || ""); toast({ title: "✅ הועתק!" }); }}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <Label className="text-sm">פעיל</Label>
                        <Switch checked={group.is_active} onCheckedChange={(v) => handleToggleGroup(group.id, v)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">אישור אוטומטי</Label>
                        <Switch checked={group.auto_approve} onCheckedChange={(v) => handleToggleAutoApprove(group.id, v)} />
                      </div>

                      {/* Webhook control */}
                      <div className="pt-2 border-t border-border/50">
                        {group.webhook_active ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-2"
                            onClick={() => handleRemoveWebhook(group.id)}
                            disabled={settingUpWebhook === group.id}
                          >
                            {settingUpWebhook === group.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <WifiOff className="h-3 w-3" />}
                            הסר Webhook
                          </Button>
                        ) : (
                          <Button
                            variant="gradient"
                            size="sm"
                            className="w-full gap-2"
                            onClick={() => handleSetupWebhook(group.id)}
                            disabled={settingUpWebhook === group.id || !group.bot_token}
                          >
                            {settingUpWebhook === group.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3" />}
                            הפעל Webhook
                          </Button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>📊 נקלטו: {group.captured_count}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

        </Tabs>

        {/* Edit Group Dialog */}
        <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>עריכת קבוצת ממסר</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>שם הקבוצה</Label>
                <Input value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Telegram Group ID</Label>
                <Input value={editGroupId} onChange={(e) => setEditGroupId(e.target.value)} dir="ltr" className="mt-1" />
              </div>
              <div>
                <Label>Bot Token</Label>
                <Input value={editBotToken} onChange={(e) => setEditBotToken(e.target.value)} dir="ltr" className="mt-1" type="password" />
              </div>
              <div className="flex items-center justify-between">
                <Label>פעיל</Label>
                <Switch checked={editGroupActive} onCheckedChange={setEditGroupActive} />
              </div>
              <div className="flex items-center justify-between">
                <Label>אישור אוטומטי</Label>
                <Switch checked={editAutoApprove} onCheckedChange={setEditAutoApprove} />
              </div>
              <div>
                <Label>טקסט לפני הפוסט (אופציונלי)</Label>
                <Input value={editPrepend} onChange={(e) => setEditPrepend(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>טקסט אחרי הפוסט (אופציונלי)</Label>
                <Input value={editAppend} onChange={(e) => setEditAppend(e.target.value)} className="mt-1" />
              </div>
              <div className="flex gap-2">
                <Button variant="gradient" className="flex-1" onClick={handleSaveGroupChanges} disabled={isUpdatingGroup}>
                  {isUpdatingGroup ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  שמור שינויים
                </Button>
                <Button variant="outline" onClick={() => setEditingGroup(null)}>ביטול</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Post Dialog */}
        <Dialog open={!!editingPost} onOpenChange={(open) => !open && setEditingPost(null)}>
          <DialogContent className="sm:max-w-lg" dir="rtl">
            <DialogHeader>
              <DialogTitle>עריכת פוסט שנקלט</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {editingPost?.image_url && (
                <img src={editingPost.image_url} alt="" className="w-full h-48 object-cover rounded-lg" />
              )}
              <div>
                <Label>טקסט לפרסום</Label>
                <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="mt-1 min-h-[150px]" dir="rtl" />
              </div>
              <div>
                <Label>קישור אפילייט</Label>
                <Input value={editUrl} onChange={(e) => setEditUrl(e.target.value)} className="mt-1" dir="ltr" />
              </div>
              <div className="flex gap-2">
                <Button variant="gradient" className="flex-1" onClick={handleSaveEdit}>
                  <Check className="h-4 w-4 mr-2" />
                  שמור שינויים
                </Button>
                <Button variant="outline" onClick={() => setEditingPost(null)}>ביטול</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
};

export default GroupListener;
