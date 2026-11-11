// GET /c/<dao>/csv: every proposal of a Commons DAO as a CSV file, read from the chain at request time.
import { ledgerCsv } from "@/lib/ledgerCsv.ts";
import { readChain } from "@/lib/server.ts";

export const dynamic = "force-dynamic";

const VALID = /^(([a-z\d]+[-_])*[a-z\d]+\.)+([a-z\d]+[-_])*[a-z\d]+$/;

export async function GET(_req: Request, { params }: { params: Promise<{ dao: string }> }) {
  const { dao } = await params;
  const missing = () => new Response("Not a Sputnik DAO on this network.\n", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  if (!VALID.test(dao) || dao.length > 64) return missing();
  const chain = readChain();
  if (!(await chain.accountExists(dao))) return missing();
  try {
    await chain.getPolicy(dao);
  } catch {
    return missing();
  }
  const csv = ledgerCsv(await chain.getProposals(dao));
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${dao}-ledger.csv"`,
      "cache-control": "public, s-maxage=60",
    },
  });
}
