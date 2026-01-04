import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface AuthGuardProps {
  children: React.ReactNode;
}

export const AuthGuard = ({ children }: AuthGuardProps) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const checkAuthorization = async (userEmail: string | undefined) => {
    if (!userEmail) return { authorized: false, status: null, exists: false };
    
    const { data, error } = await supabase
      .from("authorized_users")
      .select("email, status")
      .eq("email", userEmail.toLowerCase())
      .maybeSingle();
    
    if (error) return { authorized: false, status: null, exists: false };
    if (!data) return { authorized: false, status: null, exists: false };
    
    // Accept both 'approved' and 'active' as valid statuses
    const isApproved = data.status === "approved" || data.status === "active";
    return { authorized: isApproved, status: data.status, exists: true };
  };

  const createPendingRequest = async (email: string) => {
    // First check if already exists to avoid duplicate key error
    const { data: existing } = await supabase
      .from("authorized_users")
      .select("id, status")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    
    if (existing) {
      // Already exists - don't try to insert again
      return { created: false, alreadyExists: true, status: existing.status };
    }
    
    const { error } = await supabase
      .from("authorized_users")
      .insert({ email: email.toLowerCase(), status: "pending" });
    
    return { created: !error, alreadyExists: false, status: "pending" };
  };

  const checkIsAdmin = async (): Promise<boolean> => {
    const { data, error } = await supabase.rpc("is_admin");
    if (error) return false;
    return data === true;
  };

  const checkPendingRequests = async () => {
    const { data } = await supabase
      .from("authorized_users")
      .select("id")
      .eq("status", "pending");
    
    return data?.length || 0;
  };

  const handleUnauthorized = async (status: string | null, email: string, exists: boolean) => {
    if (status === "pending") {
      toast({
        title: "Access Pending",
        description: "Your access request is pending approval.",
      });
    } else if (!exists) {
      // User not in list, create pending request
      const result = await createPendingRequest(email);
      if (result.created) {
        toast({
          title: "Access Requested",
          description: "Your access request is pending approval.",
        });
      } else if (result.alreadyExists) {
        toast({
          title: "Access Status",
          description: `Your status is: ${result.status}. Contact admin if needed.`,
        });
      } else {
        toast({
          title: "Request Failed",
          description: "Could not submit access request. Please try again.",
          variant: "destructive",
        });
      }
    } else {
      // User exists but not approved
      toast({
        title: "Access Denied",
        description: `Your current status is: ${status}. Contact the administrator.`,
        variant: "destructive",
      });
    }
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const notifyAdminOfPendingRequests = async (pendingCount: number) => {
    if (pendingCount > 0) {
      toast({
        title: "Pending Requests",
        description: `You have ${pendingCount} pending access request${pendingCount > 1 ? "s" : ""}.`,
        action: (
          <button
            onClick={() => navigate("/admin")}
            className="text-primary underline text-sm"
          >
            View
          </button>
        ),
      });
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      
      if (!session?.user) {
        setLoading(false);
        setIsAuthorized(false);
        navigate("/auth");
      } else {
        setTimeout(async () => {
          const { authorized, status, exists } = await checkAuthorization(session.user.email);
          if (authorized) {
            setIsAuthorized(true);
            setLoading(false);
            
            // Check if user is admin using RLS function
            const isAdmin = await checkIsAdmin();
            if (isAdmin) {
              const pendingCount = await checkPendingRequests();
              notifyAdminOfPendingRequests(pendingCount);
            }
          } else {
            handleUnauthorized(status, session.user.email || "", exists);
          }
        }, 0);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      
      if (!session?.user) {
        setLoading(false);
        navigate("/auth");
      } else {
        const { authorized, status, exists } = await checkAuthorization(session.user.email);
        if (authorized) {
          setIsAuthorized(true);
          setLoading(false);
          
          // Check if user is admin using RLS function
          const isAdmin = await checkIsAdmin();
          if (isAdmin) {
            const pendingCount = await checkPendingRequests();
            notifyAdminOfPendingRequests(pendingCount);
          }
        } else {
          handleUnauthorized(status, session.user.email || "", exists);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !isAuthorized) {
    return null;
  }

  return <>{children}</>;
};
