export interface GettingStartedStep {
  title: string;
  description: string;
}

// A vertical numbered list, not a horizontal timeline -- reads correctly
// on mobile with no layout change needed, and the connecting line is one
// continuous absolutely-positioned element rather than per-step segments,
// so it stays correct regardless of how tall any individual step's text
// wraps to.
export function GettingStartedSteps({ steps }: { steps: GettingStartedStep[] }) {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute bottom-2 left-[17px] top-2 w-px bg-border"
      />
      <ol className="relative flex flex-col gap-6">
        {steps.map((step, index) => (
          <li key={step.title} className="relative flex gap-4">
            <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {index + 1}
            </span>
            <div className="pt-1.5">
              <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
