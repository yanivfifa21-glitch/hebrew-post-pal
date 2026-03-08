import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, UserCheck, Clock, Trash2, ShieldOff, KeyRound, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

interface PendingUser {
  id: string;
  email: string;
  status: string;
  created_at: string;
}

const Admin = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: string; userId: string; email: string }>({ open: false, type: "", userId: "", email: "" });

  const checkIsAdmin = async (): Promise<boolean> => {
    const { data, error } = await supabase.rpc("is_admin");
    if (error) return false;
    return data === true;
  };

  useEffect(() => {
    const checkAdminAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        navigate("/auth");
        return;
      }

      // Use RLS-based admin check instead of hardcoded email
      const adminStatus = await checkIsAdmin();
      if (!adminStatus) {
        toast({
          title: "Access Denied",
          description: "You don't have permission to access this page.",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      setIsAdmin(true);
      await fetchPendingUsers();
      setLoading(false);
    };

    checkAdminAndFetch();
  }, [navigate]);

  const fetchPendingUsers = async () => {
    const { data, error } = await supabase
      .from("authorized_users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching users:", error);
      return;
    }

    setPendingUsers(data || []);
  };

  const handleApprove = async (userId: string, email: string) => {
    setProcessingId(userId);
    
    const { error } = await supabase
      .from("authorized_users")
      .update({ status: "approved" })
      .eq("id", userId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to approve user.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "User Approved",
        description: `${email} can now access the app.`,
      });
      await fetchPendingUsers();
    }
    
    setProcessingId(null);
  };

  const handleReject = async (userId: string, email: string) => {
    setProcessingId(userId);
    
    const { error } = await supabase
      .from("authorized_users")
      .delete()
      .eq("id", userId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to reject user.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "User Rejected",
        description: `${email} has been removed.`,
      });
      await fetchPendingUsers();
    }
    
    setProcessingId(null);
  };

  const handleRevokeAccess = async (userId: string, email: string) => {
    setProcessingId(userId);
    const { error } = await supabase
      .from("authorized_users")
      .update({ status: "revoked" })
      .eq("id", userId);

    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לבטל גישה.", variant: "destructive" });
    } else {
      toast({ title: "הגישה בוטלה", description: `${email} כבר לא יכול להיכנס.` });
      await fetchPendingUsers();
    }
    setProcessingId(null);
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    setProcessingId(userId);
    const { error } = await supabase
      .from("authorized_users")
      .delete()
      .eq("id", userId);

    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן למחוק משתמש.", variant: "destructive" });
    } else {
      toast({ title: "משתמש נמחק", description: `${email} הוסר מהמערכת.` });
      await fetchPendingUsers();
    }
    setProcessingId(null);
  };

  const handleSendPasswordReset = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast({ title: "שגיאה", description: "לא ניתן לשלוח מייל איפוס.", variant: "destructive" });
    } else {
      toast({ title: "נשלח!", description: `מייל איפוס סיסמה נשלח ל-${email}` });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const pending = pendingUsers.filter(u => u.status === "pending");
  const approved = pendingUsers.filter(u => u.status === "approved");

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground">Manage access requests</p>
        </div>

        {/* Pending Requests */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              Pending Requests ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pending.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No pending requests
              </p>
            ) : (
              <div className="space-y-3">
                {pending.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{user.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleApprove(user.id, user.email)}
                        disabled={processingId === user.id}
                      >
                        {processingId === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(user.id, user.email)}
                        disabled={processingId === user.id}
                      >
                        {processingId === user.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Approved Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-green-500" />
              Approved Users ({approved.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {approved.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No approved users
              </p>
            ) : (
              <div className="space-y-2">
                {approved.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{user.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="secondary" className="bg-green-500/20 text-green-600">
                      Approved
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Admin;
