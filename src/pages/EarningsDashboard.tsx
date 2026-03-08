import { useState, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import {
  DollarSign,
  ShoppingCart,
  CheckCircle2,
  TrendingUp,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type TimeRange = "last_week" | "this_month" | "last_month";

type AffiliateOrder = {
  order_id: string;
  product_id: string;
  product_title: string;
  product_image: string;
  order_status: string;
  paid_amount: number;
  estimated_commission: number;
  created_at: string;
  is_completed: boolean;
};

type EarningsSummary = {
  paid_orders: number;
  paid_earnings: number;
  completed_orders: number;
  completed_earnings: number;
  orders: AffiliateOrder[];
  daily_stats: Record<
    string,
    {
      paid_orders: number;
      paid_earnings: number;
      completed_orders: number;
      completed_earnings: number;
    }
  >;
};

function getTimeRange(range: TimeRange): { startTime: string; endTime: string } {
  const now = new Date();
  // Convert to PST (UTC-8)
  const pstOffset = -8 * 60 * 60 * 1000;

  let start: Date;
  let end: Date;

  if (range === "last_week") {
    end = now;
    start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === "this_month") {
    end = now;
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    // last_month
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  }

  const formatPST = (d: Date) => {
    const pst = new Date(d.getTime() + pstOffset - d.getTimezoneOffset() * 60 * 1000);
    return pst.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  };

  return { startTime: formatPST(start), endTime: formatPST(end) };
}

const timeRangeLabels: Record<TimeRange, string> = {
  last_week: "שבוע אחרון",
  this_month: "חודש נוכחי",
  last_month: "חודש שעבר",
};

const chartConfig = {
  paid_orders: { label: "הזמנות ששולמו", color: "hsl(213, 94%, 50%)" },
  paid_earnings: { label: "רווח (שולם)", color: "hsl(160, 84%, 39%)" },
  completed_orders: { label: "הזמנות שהושלמו", color: "hsl(45, 93%, 47%)" },
  completed_earnings: { label: "רווח (הושלם)", color: "hsl(24, 95%, 53%)" },
};

const EarningsDashboard = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>("last_week");
  const [data, setData] = useState<EarningsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchEarnings = useCallback(
    async (range: TimeRange) => {
      setIsLoading(true);
      try {
        const { startTime, endTime } = getTimeRange(range);
        const { data: result, error } = await supabase.functions.invoke(
          "fetch-affiliate-orders",
          { body: { startTime, endTime } }
        );
        if (error) throw error;
        if (!result?.success) throw new Error(result?.error || "Failed to fetch");
        setData(result.data);
        setHasFetched(true);
      } catch (err) {
        toast({
          title: "שגיאה בטעינת נתונים",
          description: err instanceof Error ? err.message : "שגיאה לא ידועה",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const handleTimeRangeChange = (range: TimeRange) => {
    setTimeRange(range);
    fetchEarnings(range);
  };

  // Prepare chart data
  const chartData = data
    ? Object.entries(data.daily_stats)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, stats]) => ({
          date: date.substring(5), // MM-DD
          ...stats,
        }))
    : [];

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              <span className="gradient-text">דשבורד רווחים</span>
            </h1>
            <p className="text-muted-foreground mt-1">
              נתוני הכנסות מפורטל השיווק של AliExpress
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(Object.keys(timeRangeLabels) as TimeRange[]).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? "default" : "outline"}
                size="sm"
                onClick={() => handleTimeRangeChange(range)}
                disabled={isLoading}
                className="gap-1.5"
              >
                <Calendar className="h-3.5 w-3.5" />
                {timeRangeLabels[range]}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchEarnings(timeRange)}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Initial state */}
        {!hasFetched && !isLoading && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <DollarSign className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground text-center">
                בחר טווח זמן כדי לטעון את נתוני הרווחים שלך
              </p>
              <Button onClick={() => fetchEarnings(timeRange)}>
                <TrendingUp className="h-4 w-4 ml-2" />
                טען נתונים
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
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

        {/* Stats Cards */}
        {data && !isLoading && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <EarningsStatCard
                title="הזמנות ששולמו"
                value={data.paid_orders}
                color="hsl(213, 94%, 50%)"
                icon={ShoppingCart}
              />
              <EarningsStatCard
                title="רווח להזמנות ששולמו (USD)"
                value={`$${data.paid_earnings.toFixed(2)}`}
                color="hsl(160, 84%, 39%)"
                icon={DollarSign}
              />
              <EarningsStatCard
                title="הזמנות שהושלמו"
                value={data.completed_orders}
                color="hsl(45, 93%, 47%)"
                icon={CheckCircle2}
              />
              <EarningsStatCard
                title="רווח להזמנות שהושלמו (USD)"
                value={`$${data.completed_earnings.toFixed(2)}`}
                color="hsl(24, 95%, 53%)"
                icon={TrendingUp}
              />
            </div>

            {/* Chart */}
            {chartData.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">גרף רווחים יומי</CardTitle>
                </CardHeader>
                <CardContent>
                  <ChartContainer config={chartConfig} className="h-[300px] w-full">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" />
                      <YAxis className="text-xs" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="paid_orders"
                        name="הזמנות ששולמו"
                        stroke="hsl(213, 94%, 50%)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="paid_earnings"
                        name="רווח (שולם)"
                        stroke="hsl(160, 84%, 39%)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="completed_orders"
                        name="הזמנות שהושלמו"
                        stroke="hsl(45, 93%, 47%)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="completed_earnings"
                        name="רווח (הושלם)"
                        stroke="hsl(24, 95%, 53%)"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Products Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">מוצרים שנמכרו</CardTitle>
              </CardHeader>
              <CardContent>
                {data.orders.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    אין הזמנות בטווח הזמן שנבחר
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">מוצר</TableHead>
                          <TableHead className="text-right">סכום</TableHead>
                          <TableHead className="text-right">עמלה</TableHead>
                          <TableHead className="text-right">סטטוס</TableHead>
                          <TableHead className="text-right">תאריך</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.orders.map((order, idx) => (
                          <TableRow key={`${order.order_id}_${order.product_id || idx}`}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {order.product_image && (
                                  <img
                                    src={order.product_image}
                                    alt=""
                                    className="h-10 w-10 rounded-md object-cover flex-shrink-0"
                                  />
                                )}
                                <span className="text-sm line-clamp-2 max-w-[200px]">
                                  {order.product_title || `מוצר #${order.product_id}`}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">
                              ${order.paid_amount.toFixed(2)}
                            </TableCell>
                            <TableCell className="font-semibold text-primary">
                              ${order.estimated_commission.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={order.is_completed ? "default" : "secondary"}
                                className={
                                  order.is_completed
                                    ? "bg-green-500/15 text-green-600 border-green-500/30"
                                    : ""
                                }
                              >
                                {order.is_completed ? "הושלם" : "שולם"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {order.created_at?.substring(0, 10) || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MainLayout>
  );
};

function EarningsStatCard({
  title,
  value,
  color,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ backgroundColor: color }}
      />
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

export default EarningsDashboard;
