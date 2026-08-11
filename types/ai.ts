import type { Task } from "@/types/task";

export interface TaskDraft {
  title: string;
  description: string;
  category: Task["category"];
  difficulty: Task["difficulty"];
  estimatedTime: string;
  rewardUsdc: number;
}
