"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { GettingStartedRoleCard } from "@/components/onboarding/GettingStartedRoleCard";
import { GettingStartedSteps } from "@/components/onboarding/GettingStartedSteps";

type Path = "tasker" | "creator";

const TASKER_STEPS = [
  { title: "Find a task", description: "Browse available tasks and choose work that fits." },
  { title: "Start it", description: "Open a task and apply to start when you're ready." },
  {
    title: "Do the work",
    description: "Follow the instructions and work with the assigned task content.",
  },
  { title: "Submit", description: "Send your completed work through the task workspace." },
  { title: "Get paid", description: "Accepted work moves through evaluation and payout." },
];

const CREATOR_STEPS = [
  { title: "Create a task", description: "Describe the work you need done." },
  { title: "Fund it", description: "Provide the task's required funding." },
  { title: "Get applicants", description: "Taskers can discover and apply to the task." },
  {
    title: "Review the work",
    description: "Review the resulting submission and decide whether it's accepted.",
  },
  {
    title: "Get it completed",
    description: "Once the work is accepted, the task completes and payout runs.",
  },
];

// No persisted "seen onboarding" state anywhere -- this is deliberately
// just component-local state (11F decision: option (a), no database
// column, no localStorage). Reloading or leaving the page always returns
// here fresh; there is nothing to reset or expire.
export function GettingStartedExperience() {
  const [path, setPath] = useState<Path | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Moves focus (and, for screen readers, attention) to the new panel's
  // own heading after a role is chosen -- the clicked button itself is
  // unmounted at that point, so without this the browser would otherwise
  // just drop focus back to <body>. tabIndex={-1} on the heading below is
  // what makes it a valid, non-tab-order programmatic focus target.
  useEffect(() => {
    if (path !== null) {
      headingRef.current?.focus();
    }
  }, [path]);

  if (path === null) {
    return (
      <div className="flex flex-col gap-5">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          I want to...
        </h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <GettingStartedRoleCard
            role="tasker"
            title="Earn by completing tasks"
            description="Discover small tasks, complete the work, submit it, and earn USDC."
            onSelect={() => setPath("tasker")}
          />
          <GettingStartedRoleCard
            role="creator"
            title="Get work completed"
            description="Post a task, fund it, review the work, and get it completed."
            onSelect={() => setPath("creator")}
          />
        </div>
        <p className="text-sm text-zinc-500">
          You can do both — switch between finding work and creating tasks
          anytime.
        </p>
      </div>
    );
  }

  const isTasker = path === "tasker";

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setPath(null)}
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-zinc-600 transition-colors hover:text-foreground dark:text-zinc-400"
      >
        ← Choose a different path
      </button>

      <Card className="flex flex-col gap-6 p-6 shadow-sm sm:p-8">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight text-foreground focus:outline-none"
        >
          {isTasker ? "How earning works" : "How creating a task works"}
        </h2>

        <GettingStartedSteps steps={isTasker ? TASKER_STEPS : CREATOR_STEPS} />

        <Button
          href={isTasker ? "/marketplace" : "/marketplace/new"}
          variant="brand"
          size="lg"
          className="self-start"
        >
          {isTasker ? "Browse Tasks" : "Create a Task"}
        </Button>
      </Card>
    </div>
  );
}
