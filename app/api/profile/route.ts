import { NextResponse } from "next/server";
import { isValidAddress } from "@/lib/utils/address";
import { getUserByWallet } from "@/services/users/walletUser";
import { getProfileStats } from "@/services/dashboard/mockProfileService";
import { getEarningsSummary } from "@/services/dashboard/mockEarningsService";

const EMPTY_STATS = {
  memberSince: "—",
  tasksCompleted: 0,
  tasksInProgress: 0,
  reputationScore: 0,
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");

  if (!wallet || !isValidAddress(wallet)) {
    return NextResponse.json(
      { error: "A valid wallet address is required." },
      { status: 400 }
    );
  }

  const user = await getUserByWallet(wallet);
  if (!user) {
    return NextResponse.json({ stats: EMPTY_STATS, totalEarningsUsdc: 0 });
  }

  const [stats, earnings] = await Promise.all([
    getProfileStats(user.id),
    getEarningsSummary(user.id),
  ]);

  return NextResponse.json({
    stats,
    totalEarningsUsdc: earnings.totalEarningsUsdc,
  });
}
