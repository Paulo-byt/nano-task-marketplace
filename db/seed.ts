import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SEED_TASKS = [
  {
    title: "Write a 100-word product description",
    description:
      "Craft a concise, engaging description for a new USDC savings app.",
    rewardUsdc: "0.75",
    category: "Writing" as const,
    difficulty: "Beginner" as const,
    estimatedTime: "10 min",
    creator: "0x8f2a...44e1",
  },
  {
    title: "Proofread a blog post for grammar",
    description:
      "Review a 600-word draft for typos, grammar, and clarity issues.",
    rewardUsdc: "0.50",
    category: "Writing" as const,
    difficulty: "Beginner" as const,
    estimatedTime: "15 min",
    creator: "0x3c91...7b02",
  },
  {
    title: "Label 50 images for model training",
    description: "Tag product photos with the correct category from a list.",
    rewardUsdc: "1.20",
    category: "AI" as const,
    difficulty: "Beginner" as const,
    estimatedTime: "20 min",
    creator: "0x1a4f...9d3c",
  },
  {
    title: "Rate chatbot responses for helpfulness",
    description:
      "Score 20 AI-generated replies on a 1-5 helpfulness scale with notes.",
    rewardUsdc: "2.00",
    category: "AI" as const,
    difficulty: "Intermediate" as const,
    estimatedTime: "30 min",
    creator: "builder.eth",
  },
  {
    title: "Summarize 3 competitor pricing pages",
    description: "Produce a short comparison table of plans and price tiers.",
    rewardUsdc: "3.50",
    category: "Research" as const,
    difficulty: "Intermediate" as const,
    estimatedTime: "45 min",
    creator: "0x77bd...12a4",
  },
  {
    title: "Find 10 verified sources on a topic",
    description:
      "Compile credible, linkable sources for a report on stablecoin adoption.",
    rewardUsdc: "2.75",
    category: "Research" as const,
    difficulty: "Intermediate" as const,
    estimatedTime: "40 min",
    creator: "0xe45c...0091",
  },
  {
    title: "Design a simple logo concept",
    description:
      "Deliver 2-3 minimalist logo concepts for an early-stage dapp.",
    rewardUsdc: "5.00",
    category: "Design" as const,
    difficulty: "Advanced" as const,
    estimatedTime: "90 min",
    creator: "creator.eth",
  },
  {
    title: "Share and screenshot a campaign post",
    description: "Repost a launch announcement and submit a screenshot proof.",
    rewardUsdc: "0.25",
    category: "Social" as const,
    difficulty: "Beginner" as const,
    estimatedTime: "5 min",
    creator: "0x902d...66f8",
  },
];

async function seed() {
  const { sql } = await import("drizzle-orm");
  const { db } = await import("./index");
  const { users, tasks } = await import("./schema");

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(tasks);

  if (Number(count) > 0) {
    console.log(`tasks table already has ${count} row(s) — skipping seed.`);
    return;
  }

  for (const [index, task] of SEED_TASKS.entries()) {
    const [creator] = await db
      .insert(users)
      .values({
        walletAddress: `seed:creator-${index + 1}`,
        displayName: task.creator,
      })
      .returning();

    await db.insert(tasks).values({
      title: task.title,
      description: task.description,
      rewardUsdc: task.rewardUsdc,
      category: task.category,
      difficulty: task.difficulty,
      estimatedTime: task.estimatedTime,
      creatorId: creator.id,
    });
  }

  console.log(`Seeded ${SEED_TASKS.length} tasks.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
