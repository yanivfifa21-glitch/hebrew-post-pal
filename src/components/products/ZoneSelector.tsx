import { useState, useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Zone {
  id: string;
  name: string;
  is_active: number;
}

interface ZoneSelectorProps {
  selectedZones: string[];
  onSelectionChange: (zoneIds: string[]) => void;
  className?: string;
}

export function ZoneSelector({ selectedZones, onSelectionChange, className }: ZoneSelectorProps) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchZones();
  }, []);

  const fetchZones = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const headers: Record<string, string> = {};
      if (user?.id) headers['X-User-Id'] = user.id;
      const r = await fetch('/api/zones', { headers });
      const data = await r.json();
      setZones(data || []);
    } catch {}
    setLoading(false);
  };

  if (loading || zones.length === 0) return null;

  const toggle = (zoneId: string) => {
    onSelectionChange(
      selectedZones.includes(zoneId)
        ? selectedZones.filter(id => id !== zoneId)
        : [...selectedZones, zoneId]
    );
  };

  const selectAll = () => onSelectionChange(zones.filter(z => !!z.is_active).map(z => z.id));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <Label className="font-hebrew flex items-center gap-1.5 text-sm">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          שיוך לאזורים
        </Label>
        <button
          type="button"
          onClick={selectAll}
          className="text-xs text-primary hover:underline font-hebrew"
        >
          בחר הכל
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {zones.map(zone => {
          const isSelected = selectedZones.includes(zone.id);
          return (
            <label
              key={zone.id}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-all text-sm",
                isSelected
                  ? "border-primary/30 bg-primary/10 text-foreground"
                  : "border-border hover:border-primary/20 text-muted-foreground",
                !zone.is_active && "opacity-40"
              )}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggle(zone.id)}
                className="h-3.5 w-3.5"
              />
              <span className="font-hebrew">{zone.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
