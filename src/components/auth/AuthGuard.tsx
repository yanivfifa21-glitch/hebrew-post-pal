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

  // Use RPC functions instead of direct table queries (RLS blocks direct SELECT)
  const checkAuthorization = async (): Promise<{ authorized: boolean; status: string | null }> => {
    // First check if user is authorized
    const { data: isAuthorized, error: authError } = await supabase.rpc("is_me_authorized");
    
    if (authError) {
      console.error("Auth check error:", authError);
      return { authorized: false, status: null };
    }
    
    if (isAuthorized) {
      return { authorized: true, status: "approved" };
    }
    
    // Get status to show appropriate message
    const { data: status, error: statusError } = await supabase.rpc("get_my_access_status");
    
    if (statusError) {
      // No record exists
      return { authorized: false, status: null };
    }
    
    return { authorized: false, status: status || null };
  };

  const createPendingRequest = async (email: string) => {
    // Insert request - RLS only allows inserting own email with pending status
    const { error } = await supabase
      .from("authorized_users")
      .insert({ email: email.toLowerCase(), status: "pending" });
    
    if (error) {
      // Unique constraint = already exists
      if (error.code === "23505") {
        return { created: false, alreadyExists: true };
      }
      return { created: false, alreadyExists: false };
    }
    
    return { created: true, alreadyExists: false };
  };

  const checkIsAdmin = async (): Promise<boolean> => {
    const { data, error } = await supabase.rpc("is_admin");
    if (error) return false;
    return data === true;
  };

  const checkPendingRequests = async () => {
    // Only admins can see this (RLS enforced)
    const { data } = await supabase
      .from("authorized_users")
      .select("id")
      .eq("status", "pending");
    
    return data?.length || 0;
  };

  const handleUnauthorized = async (status: string | null, email: string) => {
    if (status === "pending") {
      toast({
        title: "Access Pending",
        description: "Your access request is pending approval.",
      });
    } else if (status === null) {
      // User not in list, create pending request
      const result = await createPendingRequest(email);
      if (result.created) {
        toast({
          title: "Access Requested",
          description: "Your access request is pending approval.",
        });
      } else if (result.alreadyExists) {
        toast({
          title: "Access Pending",
          description: "Your access request already exists. Please wait for admin approval.",
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
          const { authorized, status } = await checkAuthorization();
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
            handleUnauthorized(status, session.user.email || "");
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
        const { authorized, status } = await checkAuthorization();
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
          handleUnauthorized(status, session.user.email || "");
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
