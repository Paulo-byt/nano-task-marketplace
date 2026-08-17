import Link from "next/link";

export function WelcomeSection() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Here&apos;s a quick look at your marketplace activity.
        </p>
      </div>
      <Link
        href="/get-started"
        className="text-sm font-medium text-zinc-600 underline-offset-2 hover:text-foreground hover:underline dark:text-zinc-400"
      >
        How Nano works
      </Link>
    </div>
  );
}
