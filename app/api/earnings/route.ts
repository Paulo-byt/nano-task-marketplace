import { NextResponse } from "next/server";
import { isValidAddress } from "@/lib/utils/address";
import { getUserByWallet } from "@/services/users/walletUser";
import {
  getEarningsSummary,
  getPayoutHistory,
} from "@/services/dashboard/mockEarningsService";

const EMPTY_SUMMARY = {
  totalEarningsUsdc: 0,
  availableBalanceUsdc: 0,
  pendingPayoutsUsdc: 0,
  completedPayoutsCount: 0,
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
    return NextResponse.json({ summary: EMPTY_SUMMARY, payouts: [] });
  }

  const [summary, payoutHistory] = await Promise.all([
    getEarningsSummary(user.id),
    getPayoutHistory(user.id),
  ]);

  return NextResponse.json({ summary, payouts: payoutHistory });
}
