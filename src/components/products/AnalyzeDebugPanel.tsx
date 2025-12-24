import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Bug, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export type AliErrorPayload = {
  success?: boolean;
  error?: string;
  code?: string;
  request_id?: string;
  trace_id?: string;
  raw?: unknown;
};

export type AnalyzeDebugInfo = {
  startedAt: number;
  step: string;
  inputUrl: string;
  cleanUrl?: string;
  productId?: string;
  meta?: unknown;
  affiliate?: unknown;
  hebrew?: unknown;
  lastError?: string;
};

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AnalyzeDebugPanel({ debug }: { debug: AnalyzeDebugInfo }) {
  const [open, setOpen] = useState(true);

  const summary = useMemo(() => {
    return {
      inputUrl: debug.inputUrl,
      cleanUrl: debug.cleanUrl || "—",
      productId: debug.productId || "—",
      step: debug.step,
      lastError: debug.lastError || "—",
    };
  }, [debug]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(safeStringify(debug));
      toast({ title: "Copied", description: "Debug payload copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Could not copy debug payload.", variant: "destructive" });
    }
  };

  return (
    <aside aria-label="Analyze debug panel" className="mt-6">
      <Card className="border-border/60">
        <CardHeader className="py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Bug className="h-4 w-4 text-muted-foreground" />
                דיבוג ניתוח (Analyze Debug)
              </CardTitle>
              <CardDescription className="text-xs">cleanUrl • productId • request_id/trace_id</CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyAll} className="h-8">
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen((v) => !v)}
                className="h-8"
                aria-expanded={open}
              >
                {open ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-2" />
                    Hide
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Show
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {open && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Input URL</div>
                <div className="mt-1 break-all font-mono text-xs text-foreground">{summary.inputUrl}</div>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Clean URL</div>
                <div className="mt-1 break-all font-mono text-xs text-foreground">{summary.cleanUrl}</div>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Product ID</div>
                <div className="mt-1 break-all font-mono text-xs text-foreground">{summary.productId}</div>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">Step / Last error</div>
                <div className="mt-1 break-all font-mono text-xs text-foreground">
                  {summary.step}
                  {summary.lastError !== "—" ? ` — ${summary.lastError}` : ""}
                </div>
              </div>
            </div>

            <Accordion type="multiple" className="w-full">
              <AccordionItem value="meta">
                <AccordionTrigger className="text-sm">AliExpress metadata response</AccordionTrigger>
                <AccordionContent>
                  <pre className="max-h-[360px] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs text-foreground">
{safeStringify(debug.meta)}
                  </pre>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="affiliate">
                <AccordionTrigger className="text-sm">AliExpress affiliate link response</AccordionTrigger>
                <AccordionContent>
                  <pre className="max-h-[360px] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs text-foreground">
{safeStringify(debug.affiliate)}
                  </pre>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="hebrew">
                <AccordionTrigger className="text-sm">Hebrew post response</AccordionTrigger>
                <AccordionContent>
                  <pre className="max-h-[360px] overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs text-foreground">
{safeStringify(debug.hebrew)}
                  </pre>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        )}
      </Card>
    </aside>
  );
}
