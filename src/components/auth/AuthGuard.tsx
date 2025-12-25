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
    if (!userEmail) return false;
    
    const { data, error } = await supabase
      .from("authorized_users")
      .select("email")
      .eq("email", userEmail.toLowerCase())
      .maybeSingle();
    
    return !!data && !error;
  };

  const handleUnauthorized = async () => {
    toast({
      title: "Access Denied",
      description: "You are not authorized to use this application.",
      variant: "destructive",
    });
    await supabase.auth.signOut();
    navigate("/auth");
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      
      if (!session?.user) {
        setLoading(false);
        setIsAuthorized(false);
        navigate("/auth");
      } else {
        // Defer authorization check
        setTimeout(async () => {
          const authorized = await checkAuthorization(session.user.email);
          if (authorized) {
            setIsAuthorized(true);
            setLoading(false);
          } else {
            handleUnauthorized();
          }
        }, 0);
      }
    });

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      
      if (!session?.user) {
        setLoading(false);
        navigate("/auth");
      } else {
        const authorized = await checkAuthorization(session.user.email);
        if (authorized) {
          setIsAuthorized(true);
          setLoading(false);
        } else {
          handleUnauthorized();
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