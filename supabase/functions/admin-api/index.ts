import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Tables Claude is allowed to touch. Anything else is rejected.
const ALLOWED_TABLES = new Set([
  "products",
  "app_settings",
  "zones",
  "zone_products",
  "zone_accounts",
  "captured_posts",
  "relay_groups",
  "coupon_campaigns",
  "gold_posts",
  "manual_queue",
  "automation_logs",
  "tracked_orders",
  "authorized_users",
  "user_roles",
  "messaging_accounts",
  "ad_center_products",
  "affiliate_campaigns",
  "earnings_notification_settings",
  "custom_emoji_mappings",
]);

// System actions Claude may trigger (edge functions invoked server-side).
const ALLOWED_FUNCTIONS = new Set([
  "start-publishing",
  "auto-post",
  "bulk-stock-check",
  "check-product-stock",
  "sync-live-orders",
  "daily-earnings-report",
  "fetch-affiliate-orders",
]);

type Filter = { column: string; op: string; value: unknown };

// ---------------------------------------------------------------------------
// Predefined migrations. NO external SQL is ever accepted — only these named
// entries can run. All statements must be idempotent (IF NOT EXISTS etc).
// To add a new column: add a new named entry here, then call
//   {"action":"migrate","name":"<name>"}
// ---------------------------------------------------------------------------
const MIGRATIONS: Record<string, { description: string; sql: string }> = {
  add_posts_per_send: {
    description: "Adds app_settings.posts_per_send (integer, default 1)",
    sql: `ALTER TABLE public.app_settings
            ADD COLUMN IF NOT EXISTS posts_per_send integer NOT NULL DEFAULT 1;`,
  },
};

const runMigration = async (name: string, dryRun: boolean) => {
  const migration = MIGRATIONS[name];
  if (!migration) {
    return json(
      {
        error: "migration_not_found",
        available: Object.keys(MIGRATIONS),
        hint: 'send {"action":"list_migrations"}',
      },
      404,
    );
  }
  if (dryRun) return json({ name, dry_run: true, ...migration });

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return json({ error: "db_url_not_configured" }, 500);

  const sql = postgres(dbUrl, { prepare: false, max: 1 });
  try {
    await sql.unsafe(migration.sql);
    return json({ success: true, name, description: migration.description });
  } finally {
    await sql.end({ timeout: 5 });
  }
};

const applyFilters = (q: any, filters: Filter[] | undefined) => {
  for (const f of filters ?? []) {
    switch (f.op) {
      case "eq": q = q.eq(f.column, f.value); break;
      case "neq": q = q.neq(f.column, f.value); break;
      case "gt": q = q.gt(f.column, f.value); break;
      case "gte": q = q.gte(f.column, f.value); break;
      case "lt": q = q.lt(f.column, f.value); break;
      case "lte": q = q.lte(f.column, f.value); break;
      case "like": q = q.like(f.column, String(f.value)); break;
      case "ilike": q = q.ilike(f.column, String(f.value)); break;
      case "is": q = q.is(f.column, f.value); break;
      case "in": q = q.in(f.column, f.value as unknown[]); break;
      default: throw new Error(`unsupported filter op: ${f.op}`);
    }
  }
  return q;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const expected = Deno.env.get("CLAUDE_ADMIN_TOKEN");
  if (!expected) return json({ error: "token_not_configured" }, 500);

  const provided =
    req.headers.get("x-admin-token") ??
    (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

  if (!provided || provided !== expected) return json({ error: "unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const action = String(payload?.action ?? "");
  const table = payload?.table ? String(payload.table) : "";

  const needsTable = ["select", "insert", "update", "delete"].includes(action);
  if (needsTable && !ALLOWED_TABLES.has(table)) {
    return json({ error: "table_not_allowed", allowed: [...ALLOWED_TABLES] }, 403);
  }

  try {
    switch (action) {
      case "help":
        return json({
          actions: ["help", "list_tables", "select", "insert", "update", "delete", "list_users", "set_password", "invoke", "list_migrations", "migrate"],
          tables: [...ALLOWED_TABLES],
          functions: [...ALLOWED_FUNCTIONS],
          migrations: Object.keys(MIGRATIONS),
          examples: {
            select: { action: "select", table: "products", columns: "id,title,status", filters: [{ column: "status", op: "eq", value: "Scheduled" }], order: { column: "created_at", ascending: true }, limit: 20 },
            update: { action: "update", table: "products", values: { skip_send: true }, filters: [{ column: "id", op: "eq", value: "<uuid>" }] },
            invoke: { action: "invoke", function: "start-publishing", body: {} },
            migrate: { action: "migrate", name: "add_posts_per_send" },
          },
        });

      case "list_tables":
        return json({ tables: [...ALLOWED_TABLES] });

      case "list_migrations":
        return json({
          migrations: Object.entries(MIGRATIONS).map(([name, m]) => ({ name, description: m.description })),
        });

      case "migrate":
        return await runMigration(String(payload?.name ?? ""), payload?.dry_run === true);

      case "select": {
        let q = admin.from(table).select(payload.columns ?? "*", { count: "exact" });
        q = applyFilters(q, payload.filters);
        if (payload.order?.column) {
          q = q.order(payload.order.column, { ascending: payload.order.ascending !== false });
        }
        q = q.limit(Math.min(Number(payload.limit ?? 50), 1000));
        const { data, error, count } = await q;
        if (error) throw error;
        return json({ data, count });
      }

      case "insert": {
        const { data, error } = await admin.from(table).insert(payload.values).select();
        if (error) throw error;
        return json({ data });
      }

      case "update": {
        if (!payload.filters?.length) return json({ error: "filters_required" }, 400);
        let q = admin.from(table).update(payload.values);
        q = applyFilters(q, payload.filters);
        const { data, error } = await q.select();
        if (error) throw error;
        return json({ data, updated: data?.length ?? 0 });
      }

      case "delete": {
        if (!payload.filters?.length) return json({ error: "filters_required" }, 400);
        let q = admin.from(table).delete();
        q = applyFilters(q, payload.filters);
        const { data, error } = await q.select();
        if (error) throw error;
        return json({ data, deleted: data?.length ?? 0 });
      }

      case "list_users": {
        const page = Number(payload.page ?? 1);
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        return json({
          users: data.users.map((u) => ({
            id: u.id,
            email: u.email,
            created_at: u.created_at,
            last_sign_in_at: u.last_sign_in_at,
            confirmed: !!u.email_confirmed_at,
          })),
        });
      }

      case "set_password": {
        const email = String(payload.email ?? "").toLowerCase();
        const password = String(payload.password ?? "");
        if (!email || password.length < 8) return json({ error: "invalid_input" }, 400);
        let target: { id: string } | null = null;
        for (let page = 1; page <= 20 && !target; page++) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
          if (error) throw error;
          target = data.users.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;
          if (data.users.length < 200) break;
        }
        if (!target) return json({ error: "user_not_found" }, 404);
        const { error: updErr } = await admin.auth.admin.updateUserById(target.id, { password });
        if (updErr) throw updErr;
        return json({ success: true });
      }

      case "invoke": {
        const fn = String(payload.function ?? "");
        if (!ALLOWED_FUNCTIONS.has(fn)) {
          return json({ error: "function_not_allowed", allowed: [...ALLOWED_FUNCTIONS] }, 403);
        }
        const { data, error } = await admin.functions.invoke(fn, { body: payload.body ?? {} });
        if (error) throw error;
        return json({ data });
      }

      default:
        return json({ error: "unknown_action", hint: 'send {"action":"help"}' }, 400);
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});