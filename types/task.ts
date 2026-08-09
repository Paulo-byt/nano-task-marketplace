export interface Task {
  id: string;
  title: string;
  description: string;
  rewardUsdc: number;
  category: "Writing" | "AI" | "Research" | "Design" | "Social";
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  estimatedTime: string;
  creator: string;
  creatorWalletAddress: string;
  fundingStatus: "unfunded" | "funded" | "released" | "cancelled";
  fundingTxHash: string | null;
  fundedAmountUsdc: number | null;
}
