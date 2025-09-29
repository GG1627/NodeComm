export async function GET() {
  const backendHttpUrl =
    process.env.NEXT_PUBLIC_BACKEND_HTTP_URL ||
    process.env.BACKEND_HTTP_URL ||
    "";
  const explicitWsUrl =
    process.env.NEXT_PUBLIC_WS_URL || process.env.BACKEND_WS_URL || "";
  let derivedWsUrl = "";
  try {
    if (!explicitWsUrl && backendHttpUrl) {
      const u = new URL(backendHttpUrl);
      const scheme = u.protocol === "https:" ? "wss:" : "ws:";
      derivedWsUrl = `${scheme}//${u.host}/ws`;
    }
  } catch {}
  return new Response(
    JSON.stringify({ backendHttpUrl, wsUrl: explicitWsUrl || derivedWsUrl }),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}
