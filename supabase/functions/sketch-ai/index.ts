// Supabase Edge Function: sketch-ai — turns a fund manager's idea into sandboxed Sketch rules.
// The Anthropic key lives here (secret ANTHROPIC_API_KEY), never in the browser. Only signed-in users can call it.
// Deploy:  supabase functions deploy sketch-ai   ·   Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const MODEL = Deno.env.get("SKETCH_AI_MODEL") || "claude-sonnet-4-5";

const SYSTEM = `You translate a real-estate fund manager's structuring idea into a small JavaScript rule set for a quarterly cash-flow engine.
You may ONLY define these functions on the object \`rules\` (any subset):
  rules.funding = (q, s) => ({ debt, equity })   // how to fund a cash shortfall s.shortfall in quarter q (0-based). Default: all debt.
  rules.cash    = (q, s) => ({ hold, release })  // s.fees = fees accrued this quarter net of VAT, keyed mgmt_fee|custody|auditor|sharia|engineering|board; hold = part of this quarter's fees to defer; release = part of s.held to pay now
  rules.items   = (q, s) => amount                // extra cash in quarter q: + income, − cost
  rules.phase   = (line, nq) => [w0, w1, ...]     // % per quarter for a line (land, brokerage, rett, equity, fund_setup, spv, arr_fee, bank_mgmt, custody, auditor, sharia, engineering, board, fin_advisor, base_con, dev_fee, contingency, design, supervision, licensing, insurance, marketing, revenue); return null for lines you do not change
State s (read-only numbers): shortfall, cash, minCash, loanOpen, loan, cumDrawn, cumSales, sales[], equity[], nq, facility, held, fees.
Rules: plain JavaScript, no loops over the whole model, no external access, no eval/Function/window/document/fetch/import/setTimeout. Amounts are SAR. Use the numbers the user gives (20 M = 20e6).
If part of the idea cannot be expressed with these four functions, do NOT approximate it silently: list it in "cannot".
Respond with JSON only: {"description": "<2-4 sentences, plain language, what the rules do and when they trigger>", "script": "<the JavaScript>", "cannot": ["<what could not be expressed>", ...]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const auth = req.headers.get("Authorization") || "";
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error } = await supa.auth.getUser();
    if (error || !user) return new Response(JSON.stringify({ error: "not signed in" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY is not set" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
    const body = await req.json();
    const idea = String(body.idea || "").slice(0, 4000);
    const ctx = body.context || {};
    const userMsg = `Fund context: ${JSON.stringify({ nq: ctx.nq, fund_period_months: ctx.fund_period_months, equity: ctx.equity, facility: ctx.facility, totalCost: ctx.totalCost, gdv: ctx.gdv, mgmt_fee_mode: ctx.mgmt_fee_mode })}
${ctx.existingScript ? "Existing rules (extend or replace as the idea requires):\n" + String(ctx.existingScript).slice(0, 4000) + "\n" : ""}Idea (${body.lang === "ar" ? "Arabic" : "English"}): ${idea}`;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: SYSTEM, messages: [{ role: "user", content: userMsg }] }),
    });
    const j = await r.json();
    if (!r.ok) return new Response(JSON.stringify({ error: j.error?.message || "model error" }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    const text = (j.content || []).map((c: any) => c.text || "").join("");
    const m = text.match(/\{[\s\S]*\}/);
    let out: any = null;
    try { out = JSON.parse(m ? m[0] : text); } catch { out = null; }
    if (!out || typeof out.script !== "string") return new Response(JSON.stringify({ error: "model did not return rules", raw: text.slice(0, 500) }), { status: 502, headers: { ...CORS, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ description: String(out.description || ""), script: out.script, cannot: Array.isArray(out.cannot) ? out.cannot.map(String) : [] }), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
