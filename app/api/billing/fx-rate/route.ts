import { getUsdToMntRate } from "@/lib/billing/fx";

export async function GET() {
  const rate = await getUsdToMntRate();
  return Response.json(rate, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
