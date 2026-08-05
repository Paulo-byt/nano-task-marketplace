import { NextResponse } from "next/server";
import { isValidAddress } from "@/lib/utils/address";
import { getUserByWallet } from "@/services/users/walletUser";
import { getSettingsSections } from "@/services/dashboard/mockSettingsService";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet");

  if (!wallet || !isValidAddress(wallet)) {
    return NextResponse.json(
      { error: "A valid wallet address is required." },
      { status: 400 }
    );
  }

  // No per-wallet preference storage exists yet, so a wallet with no user
  // row gets the same informational sections as one that has applied,
  // completed tasks, etc. This still performs the same lookup-only,
  // no-auto-create check every other route makes, so the branch is ready
  // to diverge once real per-user settings exist.
  await getUserByWallet(wallet);

  const sections = getSettingsSections();
  return NextResponse.json({ sections });
}
