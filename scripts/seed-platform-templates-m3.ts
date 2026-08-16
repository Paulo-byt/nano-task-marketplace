/**
 * Permanent internal/operator script -- NOT part of the application
 * runtime, and NOT a public route. Phase M3 (Platform-Owned Evergreen Task
 * System): creates the initial 11 platform-owned task templates, one
 * payload_sourced payload source each, and tops each up to 20 payload
 * items -- entirely through the existing, unmodified createPlatformTemplate
 * / createPayloadSource / addPayloadItems primitives. No task instance is
 * ever generated, no pool is ever funded, and no Circle call is ever made
 * -- this script only ever touches task_templates / payload_sources /
 * payload_items.
 *
 * All 11 templates use locally hand-authored payload content
 * (scripts/m3-payload-data.ts), not generatePayloadContent()/Anthropic --
 * Anthropic credit is deliberately kept off the Arc Testnet critical path
 * for M3-M6. The existing Anthropic integration (lib/ai/*) is untouched
 * and remains available for later production/mainnet use; this script
 * simply never calls it.
 *
 * Safely re-runnable: every step finds-or-creates rather than blindly
 * inserting, so an interrupted run resumes from wherever it stopped
 * instead of duplicating templates, sources, or payload content.
 *
 * Same env-loading fix as scripts/circle-provision-testnet-treasury-wallet.ts
 * -- loadEnvConfig(process.cwd()) runs first, and every module that reads
 * process.env at import time (db/index.ts for DATABASE_URL) is reached
 * only via a dynamic import() inside main(), never a static top-level
 * import.
 *
 * Usage:
 *   npx tsx scripts/seed-platform-templates-m3.ts
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import {
  W1_CONCEPTS,
  R1_PROTOCOLS,
  R3_PROJECTS,
  W3_SCENARIOS,
  W4_SOURCE_TEXTS,
  R5_ITEMS,
  A2_TEXTS,
  A5_MESSAGES,
  A4_PARAGRAPHS,
  S1_QUESTIONS,
  S4_MESSAGES,
} from "./m3-payload-data";

type Category = "Writing" | "AI" | "Research" | "Design" | "Social";
type Difficulty = "Beginner" | "Intermediate" | "Advanced";

interface TemplateDef {
  key: string;
  title: string;
  description: string;
  category: Category;
  difficulty: Difficulty;
  estimatedTime: string;
  rewardUsdc: number;
  payloadSourceLabel: string;
  manualItems: string[];
}

const TARGET_ITEMS_PER_TEMPLATE = 20;

// Process order per the approved M3 spec: manually curated research
// templates (W1, R1, R3) complete early, before the remaining eight.
const TEMPLATES: TemplateDef[] = [
  {
    key: "W1",
    title: "Explain a Web3 concept for beginners",
    description:
      "You will be given a single Web3 or crypto term or concept. Write a clear, jargon-free explanation of it (150-300 words) that a complete beginner with no prior knowledge could understand. Do not assume the reader knows any other Web3 terminology -- define anything you use.",
    category: "Writing",
    difficulty: "Beginner",
    estimatedTime: "15-20 min",
    rewardUsdc: 0.75,
    payloadSourceLabel: "m3-manual-curated",
    manualItems: W1_CONCEPTS,
  },
  {
    key: "R1",
    title: "Research a Web3 protocol's core mechanism",
    description:
      "You will be given the name of a real, existing Web3/blockchain protocol. Using publicly available information, write a structured summary (150-250 words) that answers: (1) what problem the protocol solves, (2) how its core mechanism works, and (3) one important tradeoff or limitation. Base your answer on real, verifiable information about the named protocol.",
    category: "Research",
    difficulty: "Intermediate",
    estimatedTime: "30-45 min",
    rewardUsdc: 2.5,
    payloadSourceLabel: "m3-manual-curated",
    manualItems: R1_PROTOCOLS,
  },
  {
    key: "R3",
    title: "Summarize a Web3 project from public sources",
    description:
      "You will be given the name of a real Web3 project. Using publicly available information, write a neutral summary (approximately 150 words) covering what the project does, who it is for, and its current status. Name at least one public source (e.g. the project's official site or documentation) you drew from.",
    category: "Research",
    difficulty: "Intermediate",
    estimatedTime: "25-35 min",
    rewardUsdc: 2.0,
    payloadSourceLabel: "m3-manual-curated",
    manualItems: R3_PROJECTS,
  },
  {
    key: "W3",
    title: "Write a crypto-community announcement",
    description:
      "You will be given a short scenario or fact about a Web3 product or community. Draft a community announcement post (50-100 words) sharing this news in a clear, friendly, non-hype tone. Avoid exaggerated claims or marketing hype.",
    category: "Writing",
    difficulty: "Beginner",
    estimatedTime: "10-15 min",
    rewardUsdc: 0.5,
    payloadSourceLabel: "m3-manual-curated",
    manualItems: W3_SCENARIOS,
  },
  {
    key: "W4",
    title: "Summarize a blockchain concept in one paragraph",
    description:
      "You will be given a longer explanation (200-400 words) of a blockchain or Web3 concept. Condense it into a single accurate paragraph (50-75 words) that preserves the important facts.",
    category: "Writing",
    difficulty: "Beginner",
    estimatedTime: "10-15 min",
    rewardUsdc: 0.5,
    payloadSourceLabel: "m3-manual-curated",
    manualItems: W4_SOURCE_TEXTS,
  },
  {
    key: "R5",
    title: "Categorize a blockchain project by type",
    description:
      "You will be given the name and a short description of a blockchain project. Classify it into exactly one of the following categories: DeFi, NFT/Gaming, Infrastructure, DAO Tooling, or Identity. Provide a one-sentence justification for your choice.",
    category: "Research",
    difficulty: "Beginner",
    estimatedTime: "5-10 min",
    rewardUsdc: 0.3,
    payloadSourceLabel: "m3-manual-curated",
    manualItems: R5_ITEMS,
  },
  {
    key: "A2",
    title: "Classify text sentiment",
    description:
      "You will be given a short piece of text (such as a review, comment, or social post). Label its overall sentiment as positive, neutral, or negative, and give a brief one-phrase reason for your label.",
    category: "AI",
    difficulty: "Beginner",
    estimatedTime: "3-5 min",
    rewardUsdc: 0.15,
    payloadSourceLabel: "m3-manual-curated",
    manualItems: A2_TEXTS,
  },
  {
    key: "A5",
    title: "Label the intent of a support message",
    description:
      "You will be given a short customer-support-style message about a Web3 wallet or exchange product. Assign it to exactly one of the following intent categories: Billing Issue, Technical Bug, How-To Question, Complaint, or Feature Request. Provide a brief justification.",
    category: "AI",
    difficulty: "Beginner",
    estimatedTime: "5 min",
    rewardUsdc: 0.2,
    payloadSourceLabel: "m3-manual-curated",
    manualItems: A5_MESSAGES,
  },
  {
    key: "A4",
    title: "Identify factual inaccuracies in AI-generated Web3 content",
    description:
      'You will be given an AI-generated paragraph about a Web3 or crypto topic. The paragraph may or may not contain factual errors. Carefully review it and list any factual inaccuracies you find, along with a brief correction for each. If you find no errors, state "No errors found."',
    category: "AI",
    difficulty: "Advanced",
    estimatedTime: "15-25 min",
    rewardUsdc: 1.5,
    payloadSourceLabel: "m3-manual-curated",
    manualItems: A4_PARAGRAPHS,
  },
  {
    key: "S1",
    title: "Draft an FAQ answer",
    description:
      "You will be given a common question a user might ask about using a Web3 product or wallet. Write a clear, accurate answer (2-4 sentences) suitable for a help center FAQ.",
    category: "Social",
    difficulty: "Beginner",
    estimatedTime: "10 min",
    rewardUsdc: 0.4,
    payloadSourceLabel: "m3-manual-curated",
    manualItems: S1_QUESTIONS,
  },
  {
    key: "S4",
    title: "Classify community message tone",
    description:
      "You will be given a message from a community chat or forum. Classify its tone as exactly one of: constructive, hostile, confused, excited, or neutral. Provide a brief justification for your label.",
    category: "Social",
    difficulty: "Beginner",
    estimatedTime: "5 min",
    rewardUsdc: 0.2,
    payloadSourceLabel: "m3-manual-curated",
    manualItems: S4_MESSAGES,
  },
];

function normalize(content: string): string {
  return content.trim().toLowerCase();
}

async function main() {
  const { getOrCreatePlatformUser, createPlatformTemplate } = await import(
    "@/services/marketplace/taskTemplatesService"
  );
  const { createPayloadSource, addPayloadItems } = await import(
    "@/services/marketplace/payloadSourcesService"
  );
  const { db } = await import("@/db");
  const { taskTemplates, payloadSources, payloadItems, tasks, applications, submissions, payouts } =
    await import("@/db/schema");
  const { eq, and, sql } = await import("drizzle-orm");

  console.log("=== M3 seed: platform templates + payload layer (local data only) ===\n");

  const platformUser = await getOrCreatePlatformUser();
  console.log(`Platform account: ${platformUser.id} (${platformUser.displayName})`);
  console.log(
    `Treasury address configured: ${
      platformUser.walletAddress !== "0x0000000000000000000000000000000000000000"
    }\n`
  );

  interface Row {
    key: string;
    title: string;
    templateId: string;
    templateCreated: boolean;
    sourceId: string;
    sourceCreated: boolean;
    itemsBefore: number;
    itemsAdded: number;
    itemsAfter: number;
  }
  const summary: Row[] = [];

  for (const def of TEMPLATES) {
    console.log(`--- ${def.key}: ${def.title} ---`);

    if (def.manualItems.length < TARGET_ITEMS_PER_TEMPLATE) {
      throw new Error(
        `${def.key}: local data only supplies ${def.manualItems.length} item(s), need ${TARGET_ITEMS_PER_TEMPLATE}. Fix scripts/m3-payload-data.ts before proceeding.`
      );
    }

    // 1. Template: find-or-create, matched on (creatorId, title).
    const existingTemplates = await db
      .select()
      .from(taskTemplates)
      .where(
        and(eq(taskTemplates.creatorId, platformUser.id), eq(taskTemplates.title, def.title))
      );

    if (existingTemplates.length > 1) {
      throw new Error(
        `${def.key}: found ${existingTemplates.length} existing templates titled "${def.title}" -- expected at most 1. Refusing to proceed; needs manual review.`
      );
    }

    let template = existingTemplates[0];
    let templateCreated = false;
    if (!template) {
      template = await createPlatformTemplate({
        title: def.title,
        description: def.description,
        category: def.category,
        difficulty: def.difficulty,
        estimatedTime: def.estimatedTime,
        rewardUsdc: def.rewardUsdc,
        payloadMode: "payload_sourced",
      });
      templateCreated = true;
      console.log(`  Created template ${template.id}`);
    } else {
      console.log(`  Found existing template ${template.id}`);
      if (template.payloadMode !== "payload_sourced") {
        throw new Error(
          `${def.key} (${template.id}): existing template has payloadMode="${template.payloadMode}", expected "payload_sourced". Refusing to proceed; needs manual review.`
        );
      }
    }

    // 2. Payload source: find-or-create, exactly one per template.
    const existingSources = await db
      .select()
      .from(payloadSources)
      .where(eq(payloadSources.templateId, template.id));

    if (existingSources.length > 1) {
      throw new Error(
        `${def.key} (${template.id}): found ${existingSources.length} payload sources -- expected at most 1. Refusing to proceed; needs manual review.`
      );
    }

    let source = existingSources[0];
    let sourceCreated = false;
    if (!source) {
      source = await createPayloadSource({
        templateId: template.id,
        label: def.payloadSourceLabel,
        kind: "manual",
      });
      sourceCreated = true;
      console.log(`  Created payload source ${source.id} (kind=${source.kind})`);
    } else {
      console.log(`  Found existing payload source ${source.id} (kind=${source.kind})`);
    }

    // 3. Payload items: top up to TARGET_ITEMS_PER_TEMPLATE from local
    // data only, deduped against whatever already exists (idempotent
    // re-run safety) -- never generated, never fetched from Anthropic.
    const existingItemRows = await db
      .select({ content: payloadItems.content })
      .from(payloadItems)
      .where(eq(payloadItems.sourceId, source.id));

    const seen = new Set(existingItemRows.map((r) => normalize(r.content)));
    const itemsBefore = existingItemRows.length;
    const needed = Math.max(0, TARGET_ITEMS_PER_TEMPLATE - itemsBefore);
    console.log(`  Existing payload items: ${itemsBefore}, needed: ${needed}`);

    let itemsAdded = 0;

    if (needed > 0) {
      const candidates: string[] = [];
      for (const item of def.manualItems) {
        if (candidates.length >= needed) break;
        const key = normalize(item);
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(item);
        }
      }

      if (candidates.length < needed) {
        throw new Error(
          `${def.key}: only ${candidates.length} unused local item(s) available, but ${needed} are needed (pool size ${def.manualItems.length}). Refusing to proceed; needs more curated items in scripts/m3-payload-data.ts.`
        );
      }

      const inserted = await addPayloadItems(source.id, candidates);
      itemsAdded = inserted.length;
      console.log(`  Added ${itemsAdded} payload item(s)`);
    }

    const itemsAfter = itemsBefore + itemsAdded;
    summary.push({
      key: def.key,
      title: def.title,
      templateId: template.id,
      templateCreated,
      sourceId: source.id,
      sourceCreated,
      itemsBefore,
      itemsAdded,
      itemsAfter,
    });
    console.log(`  Final item count: ${itemsAfter}\n`);
  }

  console.log("=== SUMMARY ===");
  console.table(
    summary.map((r) => ({
      key: r.key,
      templateId: r.templateId.slice(0, 8),
      templateCreated: r.templateCreated,
      sourceId: r.sourceId.slice(0, 8),
      sourceCreated: r.sourceCreated,
      itemsBefore: r.itemsBefore,
      itemsAdded: r.itemsAdded,
      itemsAfter: r.itemsAfter,
    }))
  );

  const totalItems = summary.reduce((sum, r) => sum + r.itemsAfter, 0);
  console.log(
    `\nTotal payload items across all ${summary.length} templates: ${totalItems} (target: ${
      TEMPLATES.length * TARGET_ITEMS_PER_TEMPLATE
    })`
  );

  const [taskCount] = await db.select({ n: sql<number>`count(*)::int` }).from(tasks);
  const [appCount] = await db.select({ n: sql<number>`count(*)::int` }).from(applications);
  const [subCount] = await db.select({ n: sql<number>`count(*)::int` }).from(submissions);
  const [payoutCount] = await db.select({ n: sql<number>`count(*)::int` }).from(payouts);
  console.log(
    `\nUnrelated tables (must be unchanged from baseline): tasks=${taskCount.n}, applications=${appCount.n}, submissions=${subCount.n}, payouts=${payoutCount.n}`
  );
}

main().catch((err) => {
  console.error("M3 seed failed:", err);
  process.exit(1);
});
