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
    if (!userEmail) return { authorized: false, status: null };
    
    const { data, error } = await supabase
      .from("authorized_users")
      .select("email, status")
      .eq("email", userEmail.toLowerCase())
      .maybeSingle();
    
    if (error) return { authorized: false, status: null };
    if (!data) return { authorized: false, status: null };
    
    return { authorized: data.status === "approved", status: data.status };
  };

  const createPendingRequest = async (email: string) => {
    const { error } = await supabase
      .from("authorized_users")
      .insert({ email: email.toLowerCase(), status: "pending" });
    
    return !error;
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

  const handleUnauthorized = async (status: string | null, email: string) => {
    if (status === "pending") {
      toast({
        title: "Access Pending",
        description: "Your access request is pending approval.",
      });
    } else {
      // User not in list, create pending request
      const created = await createPendingRequest(email);
      if (created) {
        toast({
          title: "Access Requested",
          description: "Your access request is pending approval.",
        });
      } else {
        toast({
          title: "Request Failed",
          description: "Could not submit access request. Please try again.",
          variant: "destructive",
        });
      }
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
          const { authorized, status } = await checkAuthorization(session.user.email);
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
        const { authorized, status } = await checkAuthorization(session.user.email);
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
