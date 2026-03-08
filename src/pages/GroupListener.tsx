import { useEffect, useState, useCallback } from "react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { StockBadge } from "@/components/products/StockBadge";
import {
  Radio, Plus, Trash2, Loader2, Eye, EyeOff, Check, X, Edit, Send,
  Headphones, Copy, ChevronDown, Settings, RefreshCw, Wifi, WifiOff,
  ExternalLink, Clock, Filter, CheckCircle, XCircle, AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { CapturedPost, ListenedGroup } from "@/types/product";
import { format } from "date-fns";

const PYTHON_SCRIPT_TEMPLATE = `#!/usr/bin/env python3
"""
AliAffilio Telegram Group Listener
Captures product posts from Telegram groups and sends them to your panel.
"""
import asyncio
import os
import re
import httpx
from telethon import TelegramClient, events

# Configuration - set these environment variables
API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SESSION_NAME = os.getenv("SESSION_NAME", "listener_session")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")  # anon key
USER_ID = os.getenv("USER_ID", "")  # your Supabase user ID
FUNCTION_URL = f"{SUPABASE_URL}/functions/v1/process-captured-post"

# Group IDs to listen to (will be fetched from Supabase)
LISTENED_GROUPS: dict[int, dict] = {}

client = TelegramClient(SESSION_NAME, API_ID, API_HASH)

async def fetch_listened_groups():
    """Fetch active listened groups from Supabase"""
    global LISTENED_GROUPS
    async with httpx.AsyncClient() as http:
        resp = await http.get(
            f"{SUPABASE_URL}/rest/v1/listened_groups?is_active=eq.true&user_id=eq.{USER_ID}",
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
        )
        if resp.status_code == 200:
            groups = resp.json()
            LISTENED_GROUPS = {
                int(g["telegram_group_id"]): g for g in groups
            }
            print(f"Loaded {len(LISTENED_GROUPS)} groups to listen")

def extract_urls(text: str) -> list[str]:
    return re.findall(r'https?://[^\\s<>"{}|\\\\^\\x60\\[\\]]+', text)

async def upload_image(image_bytes: bytes, filename: str) -> str | None:
    """Upload image to Supabase Storage"""
    async with httpx.AsyncClient() as http:
        resp = await http.post(
            f"{SUPABASE_URL}/storage/v1/object/product-images/captured/{filename}",
            content=image_bytes,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "image/jpeg",
            },
        )
        if resp.status_code in (200, 201):
            return f"{SUPABASE_URL}/storage/v1/object/public/product-images/captured/{filename}"
    return None

async def process_message(event, group_info: dict):
    """Process a captured message"""
    message = event.message
    text = message.text or message.message or ""
    urls = extract_urls(text)
    ali_url = next((u for u in urls if "aliexpress" in u.lower()), None)

    image_url = None
    if message.photo:
        import uuid
        filename = f"{uuid.uuid4().hex}.jpg"
        image_bytes = await client.download_media(message.photo, bytes)
        if image_bytes:
            image_url = await upload_image(image_bytes, filename)

    payload = {
        "userId": USER_ID,
        "originalText": text,
        "originalUrl": ali_url or (urls[0] if urls else ""),
        "imageUrl": image_url,
        "sourceGroupId": group_info["id"],
        "sourceGroupName": group_info["group_name"],
    }

    async with httpx.AsyncClient() as http:
        resp = await http.post(
            FUNCTION_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
            },
        )
        if resp.status_code == 200:
            print(f"✓ Captured post from {group_info['group_name']}")
        else:
            print(f"✗ Failed to process: {resp.text}")

@client.on(events.NewMessage())
async def handler(event):
    chat_id = event.chat_id
    if chat_id in LISTENED_GROUPS:
        await process_message(event, LISTENED_GROUPS[chat_id])

async def main():
    await client.start()
    print("Listener started!")
    await fetch_listened_groups()
    
    # Refresh groups every 5 minutes
    async def refresh_loop():
        while True:
            await asyncio.sleep(300)
            await fetch_listened_groups()
    
    asyncio.create_task(refresh_loop())
    await client.run_until_disconnected()

if __name__ == "__main__":
    asyncio.run(main())
`;

const GroupListener = () => {
  const [groups, setGroups] = useState<ListenedGroup[]>([]);
  const [capturedPosts, setCapturedPosts] = useState<CapturedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
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
  const [affiliateParams, setAffiliateParams] = useState<Record<string, string>>({});
  const [listenerUrl, setListenerUrl] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    fetchGroups();
    fetchCapturedPosts();
    fetchSettings();
    setupRealtime();
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
        toast({ title: `📬 פוסט חדש נקלט!` });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  };

  const fetchGroups = async () => {
    try {
      const { data, error } = await supabase
        .from("listened_groups")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setGroups((data || []) as ListenedGroup[]);
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
        .select("*, listened_groups(group_name)")
        .order("captured_at", { ascending: false })
        .limit(100);

      if (postFilter !== "all") {
        query = query.eq("status", postFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setCapturedPosts((data || []) as CapturedPost[]);
    } catch (e) {
      console.error("Error fetching posts:", e);
    } finally {
      setIsLoadingPosts(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("app_settings")
        .select("affiliate_params, listener_api_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setAffiliateParams((data.affiliate_params as Record<string, string>) || {});
        setListenerUrl(data.listener_api_url || "");
      }
    } catch {}
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
      const { error } = await supabase.from("listened_groups").insert({
        user_id: user.id,
        group_name: newGroupName,
        telegram_group_id: newGroupId,
        auto_approve: newAutoApprove,
        text_template_prepend: newPrepend || null,
        text_template_append: newAppend || null,
      });
      if (error) throw error;
      toast({ title: "✅ קבוצה נוספה בהצלחה" });
      setShowAddGroup(false);
      setNewGroupName(""); setNewGroupId(""); setNewAutoApprove(false); setNewPrepend(""); setNewAppend("");
      fetchGroups();
    } catch {
      toast({ title: "שגיאה בהוספת קבוצה", variant: "destructive" });
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    try {
      await supabase.from("listened_groups").delete().eq("id", id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      toast({ title: "קבוצה נמחקה" });
    } catch {
      toast({ title: "שגיאה במחיקה", variant: "destructive" });
    }
  };

  const handleToggleGroup = async (id: string, isActive: boolean) => {
    await supabase.from("listened_groups").update({ is_active: isActive }).eq("id", id);
    setGroups((prev) => prev.map((g) => g.id === id ? { ...g, is_active: isActive } : g));
  };

  const handleToggleAutoApprove = async (id: string, autoApprove: boolean) => {
    await supabase.from("listened_groups").update({ auto_approve: autoApprove }).eq("id", id);
    setGroups((prev) => prev.map((g) => g.id === id ? { ...g, auto_approve: autoApprove } : g));
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
      try {
        await handleApprovePost(post);
        count++;
      } catch {}
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

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      await supabase.from("app_settings").update({
        affiliate_params: affiliateParams,
        listener_api_url: listenerUrl || null,
      }).eq("user_id", user.id);
      toast({ title: "✅ הגדרות נשמרו" });
    } catch {
      toast({ title: "שגיאה בשמירה", variant: "destructive" });
    } finally {
      setIsSavingSettings(false);
    }
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
            <p className="text-muted-foreground">האזן לקבוצות טלגרם, קלוט פוסטים והוסף אותם לתור עם הקישורים שלך</p>
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
              קבוצות מאזינות
              <span className="bg-primary/20 text-primary text-xs font-bold px-2 py-0.5 rounded-full">{groups.length}</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2 rounded-lg">
              <Settings className="h-4 w-4" />
              הגדרות
            </TabsTrigger>
            <TabsTrigger value="guide" className="gap-2 rounded-lg">
              <Copy className="h-4 w-4" />
              מדריך התקנה
            </TabsTrigger>
          </TabsList>

          {/* CAPTURED POSTS TAB */}
          <TabsContent value="posts" className="space-y-4">
            {/* Sub-filters */}
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
                  <p className="text-muted-foreground text-sm">הפעל את שירות ההאזנה כדי לקלוט פוסטים מקבוצות טלגרם</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {capturedPosts.map((post) => (
                  <Card key={post.id} className="glass-card overflow-hidden">
                    <div className="flex flex-col md:flex-row">
                      {/* Image */}
                      {post.image_url && (
                        <div className="w-full md:w-40 h-40 flex-shrink-0 overflow-hidden">
                          <img src={post.image_url} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      
                      <div className="flex-1 p-4 space-y-3">
                        {/* Header row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={getStatusColor(post.status)}>{getStatusLabel(post.status)}</Badge>
                          {(post as any).listened_groups?.group_name && (
                            <Badge variant="outline" className="text-xs">
                              📡 {(post as any).listened_groups.group_name}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground mr-auto">
                            {format(new Date(post.captured_at), "dd/MM/yyyy HH:mm")}
                          </span>
                        </div>

                        {/* Original text (muted) */}
                        {post.original_text && (
                          <div className="bg-muted/30 rounded-lg p-3 text-sm text-muted-foreground" dir="rtl">
                            <p className="line-clamp-3">{post.original_text}</p>
                          </div>
                        )}

                        {/* Modified text */}
                        {post.modified_text && post.modified_text !== post.original_text && (
                          <div className="bg-primary/5 rounded-lg p-3 text-sm border border-primary/20" dir="rtl">
                            <p className="line-clamp-3">{post.modified_text}</p>
                          </div>
                        )}

                        {/* Links */}
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

                        {/* Actions */}
                        {post.status === "pending_review" && (
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              variant="gradient"
                              size="sm"
                              onClick={() => handleApprovePost(post)}
                              disabled={isApproving === post.id}
                              className="gap-1"
                            >
                              {isApproving === post.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              אשר והוסף לתור
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingPost(post);
                                setEditText(post.modified_text || post.original_text || "");
                                setEditUrl(post.modified_url || post.original_url || "");
                              }}
                              className="gap-1"
                            >
                              <Edit className="h-3 w-3" />
                              ערוך
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRejectPost(post.id)}
                              className="gap-1 text-destructive hover:text-destructive"
                            >
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

          {/* GROUPS TAB */}
          <TabsContent value="groups" className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">קבוצות מאזינות</h2>
              <Dialog open={showAddGroup} onOpenChange={setShowAddGroup}>
                <DialogTrigger asChild>
                  <Button variant="gradient" className="gap-2">
                    <Plus className="h-4 w-4" />
                    הוסף קבוצה
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md" dir="rtl">
                  <DialogHeader>
                    <DialogTitle>הוסף קבוצת טלגרם</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>שם הקבוצה</Label>
                      <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="למשל: דילים חמים" className="mt-1" />
                    </div>
                    <div>
                      <Label>Telegram Group ID</Label>
                      <Input value={newGroupId} onChange={(e) => setNewGroupId(e.target.value)} placeholder="-1001234567890" dir="ltr" className="mt-1" />
                      <p className="text-xs text-muted-foreground mt-1">ניתן למצוא את ה-ID דרך @userinfobot או @getidsbot בטלגרם</p>
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
                  <h3 className="text-lg font-semibold mb-2">אין קבוצות מאזינות</h3>
                  <p className="text-muted-foreground text-sm">הוסף קבוצות טלגרם כדי להתחיל לקלוט פוסטים</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {groups.map((group) => (
                  <Card key={group.id} className="glass-card">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{group.group_name}</CardTitle>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteGroup(group.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <CardDescription dir="ltr" className="text-xs">{group.telegram_group_id}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">פעיל</Label>
                        <Switch checked={group.is_active} onCheckedChange={(v) => handleToggleGroup(group.id, v)} />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">אישור אוטומטי</Label>
                        <Switch checked={group.auto_approve} onCheckedChange={(v) => handleToggleAutoApprove(group.id, v)} />
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

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>פרמטרי אפילייט שלי</CardTitle>
                <CardDescription>הגדר את פרמטרי ה-Affiliate שלך להחלפה אוטומטית בקישורים</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {["aff_id", "dp", "cv", "sk", "aff_fcid", "aff_fsk"].map((key) => (
                  <div key={key} className="flex items-center gap-3">
                    <Label className="w-24 text-xs font-mono" dir="ltr">{key}</Label>
                    <Input
                      value={affiliateParams[key] || ""}
                      onChange={(e) => setAffiliateParams((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder={`ערך ${key}`}
                      dir="ltr"
                      className="flex-1"
                    />
                  </div>
                ))}
                <Button variant="gradient" onClick={handleSaveSettings} disabled={isSavingSettings} className="gap-2">
                  {isSavingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  שמור הגדרות
                </Button>
              </CardContent>
            </Card>

            <Card className="glass-card">
              <CardHeader>
                <CardTitle>שירות האזנה</CardTitle>
                <CardDescription>כתובת שירות ההאזנה החיצוני (Python/Telethon)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>כתובת שירות</Label>
                  <Input
                    value={listenerUrl}
                    onChange={(e) => setListenerUrl(e.target.value)}
                    placeholder="http://my-server:8080"
                    dir="ltr"
                    className="mt-1"
                  />
                </div>
                <Button variant="gradient" onClick={handleSaveSettings} disabled={isSavingSettings} className="gap-2">
                  {isSavingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  שמור
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SETUP GUIDE TAB */}
          <TabsContent value="guide" className="space-y-6">
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>🛠️ מדריך התקנה — שירות האזנה לטלגרם</CardTitle>
                <CardDescription>הנחיות שלב-אחר-שלב להפעלת שירות ההאזנה</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6" dir="rtl">
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">שלב 1: התקנת Python</h3>
                  <p className="text-sm text-muted-foreground">ודא ש-Python 3.9+ מותקן על השרת שלך</p>
                  <div className="bg-muted/50 rounded-lg p-3 font-mono text-sm" dir="ltr">
                    python3 --version
                  </div>

                  <h3 className="font-semibold text-lg">שלב 2: התקנת ספריות</h3>
                  <div className="bg-muted/50 rounded-lg p-3 font-mono text-sm" dir="ltr">
                    pip install telethon httpx
                  </div>

                  <h3 className="font-semibold text-lg">שלב 3: יצירת API Credentials בטלגרם</h3>
                  <p className="text-sm text-muted-foreground">
                    היכנס ל-<a href="https://my.telegram.org" target="_blank" rel="noopener" className="text-primary hover:underline">my.telegram.org</a> → API Development Tools → צור אפליקציה חדשה. שמור את ה-API ID וה-API Hash.
                  </p>

                  <h3 className="font-semibold text-lg">שלב 4: הגדרת משתני סביבה</h3>
                  <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs" dir="ltr">
                    <p>export TELEGRAM_API_ID="your_api_id"</p>
                    <p>export TELEGRAM_API_HASH="your_api_hash"</p>
                    <p>export SUPABASE_URL="{import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'}"</p>
                    <p>export SUPABASE_KEY="your_anon_key"</p>
                    <p>export USER_ID="your_supabase_user_id"</p>
                    <p>export SESSION_NAME="my_listener"</p>
                  </div>

                  <h3 className="font-semibold text-lg">שלב 5: הסקריפט</h3>
                  <p className="text-sm text-muted-foreground">העתק את הסקריפט הבא לקובץ <code>listener.py</code>:</p>
                  <div className="relative">
                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute top-2 left-2 z-10 gap-1"
                      onClick={() => {
                        navigator.clipboard.writeText(PYTHON_SCRIPT_TEMPLATE);
                        toast({ title: "✅ הועתק!" });
                      }}
                    >
                      <Copy className="h-3 w-3" />
                      העתק
                    </Button>
                    <pre className="bg-muted/50 rounded-lg p-4 text-xs overflow-x-auto max-h-96" dir="ltr">
                      {PYTHON_SCRIPT_TEMPLATE}
                    </pre>
                  </div>

                  <h3 className="font-semibold text-lg">שלב 6: הפעלה</h3>
                  <div className="bg-muted/50 rounded-lg p-3 font-mono text-sm" dir="ltr">
                    python3 listener.py
                  </div>
                  <p className="text-sm text-muted-foreground">
                    בפעם הראשונה יתבקש להזין את מספר הטלפון שלך ואת קוד האימות שתקבל בטלגרם. לאחר מכן ה-Session יישמר.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

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
