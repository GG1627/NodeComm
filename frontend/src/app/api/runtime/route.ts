export async function GET() {
  const backendHttpUrl =
    process.env.NEXT_PUBLIC_BACKEND_HTTP_URL ||
    process.env.BACKEND_HTTP_URL ||
    "";
  return new Response(JSON.stringify({ backendHttpUrl }), {
    headers: { "Content-Type": "application/json" },
  });
}
