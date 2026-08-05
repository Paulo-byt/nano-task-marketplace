import { NextResponse } from "next/server";
import { isValidAddress } from "@/lib/utils/address";
import { getUserByWallet } from "@/services/users/walletUser";
import { getNotifications } from "@/services/dashboard/mockNotificationService";

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
    return NextResponse.json({ notifications: [] });
  }

  const notifications = await getNotifications(user.id);
  return NextResponse.json({ notifications });
}
