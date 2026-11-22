// T&B Foods: simple voice endpoint for the Siri shortcut (deployed as Edge Function "voice", JWT verification off).
// GET /functions/v1/voice?code=YOUR-HOUSEHOLD-CODE&say=add 4 portions of chilli to the beko
const URL_ = "https://dtkmhddfsbqhwsgtfrqa.supabase.co/rest/v1/rpc/tb_voice";
const KEY = "sb_publishable_YC5ktXrw_MhGuxtrmkz8-Q_to91p5P3";

Deno.serve(async (req) => {
  const u = new URL(req.url);
  let say = u.searchParams.get("say") ?? u.searchParams.get("cmd") ?? "";
  let code = u.searchParams.get("code") ?? "";
  if (req.method === "POST") {
    try { const b = await req.json(); say = b.say ?? b.cmd ?? say; code = b.code ?? code; } catch (_) { /* ignore */ }
  }
  let text = "Sorry, something went wrong. Try again.";
  try {
    const r = await fetch(URL_, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ cmd: say, code }) });
    const j = await r.json();
    text = typeof j === "string" ? j : (j.message ?? text);
  } catch (_) { /* keep default */ }
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Access-Control-Allow-Origin": "*" } });
});
