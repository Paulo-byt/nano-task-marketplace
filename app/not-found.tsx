import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

function MapPinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// Catches any unmatched route app-wide (see the App Router's own
// not-found.js convention). components/marketplace/../not-found.tsx
// (the task-specific one from 11B) is more specific and still wins for
// anything under /marketplace/[taskId] -- this one is the fallback for
// everywhere else.
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-24 text-center">
      <Card className="flex w-full flex-col items-center gap-4 p-8 shadow-sm sm:p-10">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MapPinIcon />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Page not found
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            The page you&apos;re looking for doesn&apos;t exist or is no
            longer available.
          </p>
        </div>
        <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button href="/" variant="brand" size="lg" className="w-full sm:w-auto">
            Back to Home
          </Button>
          <Button
            href="/marketplace"
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto"
          >
            Browse Tasks
          </Button>
        </div>
      </Card>
    </div>
  );
}
