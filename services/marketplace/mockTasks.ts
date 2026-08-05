import type { Task } from "@/types/task";

export const MOCK_TASKS: Task[] = [
  {
    id: "task-1",
    title: "Write a 100-word product description",
    description:
      "Craft a concise, engaging description for a new USDC savings app.",
    rewardUsdc: 0.75,
    category: "Writing",
    difficulty: "Beginner",
    estimatedTime: "10 min",
    creator: "0x8f2a...44e1",
  },
  {
    id: "task-2",
    title: "Proofread a blog post for grammar",
    description:
      "Review a 600-word draft for typos, grammar, and clarity issues.",
    rewardUsdc: 0.5,
    category: "Writing",
    difficulty: "Beginner",
    estimatedTime: "15 min",
    creator: "0x3c91...7b02",
  },
  {
    id: "task-3",
    title: "Label 50 images for model training",
    description: "Tag product photos with the correct category from a list.",
    rewardUsdc: 1.2,
    category: "AI",
    difficulty: "Beginner",
    estimatedTime: "20 min",
    creator: "0x1a4f...9d3c",
  },
  {
    id: "task-4",
    title: "Rate chatbot responses for helpfulness",
    description:
      "Score 20 AI-generated replies on a 1-5 helpfulness scale with notes.",
    rewardUsdc: 2.0,
    category: "AI",
    difficulty: "Intermediate",
    estimatedTime: "30 min",
    creator: "builder.eth",
  },
  {
    id: "task-5",
    title: "Summarize 3 competitor pricing pages",
    description: "Produce a short comparison table of plans and price tiers.",
    rewardUsdc: 3.5,
    category: "Research",
    difficulty: "Intermediate",
    estimatedTime: "45 min",
    creator: "0x77bd...12a4",
  },
  {
    id: "task-6",
    title: "Find 10 verified sources on a topic",
    description:
      "Compile credible, linkable sources for a report on stablecoin adoption.",
    rewardUsdc: 2.75,
    category: "Research",
    difficulty: "Intermediate",
    estimatedTime: "40 min",
    creator: "0xe45c...0091",
  },
  {
    id: "task-7",
    title: "Design a simple logo concept",
    description:
      "Deliver 2-3 minimalist logo concepts for an early-stage dapp.",
    rewardUsdc: 5.0,
    category: "Design",
    difficulty: "Advanced",
    estimatedTime: "90 min",
    creator: "creator.eth",
  },
  {
    id: "task-8",
    title: "Share and screenshot a campaign post",
    description: "Repost a launch announcement and submit a screenshot proof.",
    rewardUsdc: 0.25,
    category: "Social",
    difficulty: "Beginner",
    estimatedTime: "5 min",
    creator: "0x902d...66f8",
  },
];

export function getTaskById(id: string): Task | undefined {
  return MOCK_TASKS.find((task) => task.id === id);
}
