"use client";

import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { ApplicantsList } from "@/components/dashboard/ApplicantsList";
import type { Applicant } from "@/types/postedTask";

async function fetchApplicants(taskId: string): Promise<Applicant[]> {
  const response = await fetch(`/api/tasks/${taskId}/applicants`);

  if (!response.ok) {
    throw new Error("Failed to load applicants.");
  }

  const data = await response.json();
  return data.applicants as Applicant[];
}

function StateCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10">
      <h2 className="border-b border-black/10 px-5 py-4 text-sm font-semibold text-foreground dark:border-white/10">
        Applicants
      </h2>
      <p className="px-5 py-8 text-center text-sm text-zinc-500">
        {message}
      </p>
    </div>
  );
}

export function ApplicantsContainer({ taskId }: { taskId: string }) {
  const { address, isConnected, isAuthenticated } = useWallet();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["task-applicants", taskId, address],
    queryFn: () => fetchApplicants(taskId),
    enabled: isAuthenticated,
  });

  if (!isConnected) {
    return (
      <StateCard message="Connect your wallet to see this task's applicants." />
    );
  }

  if (!isAuthenticated) {
    return <StateCard message="Sign in to see this task's applicants." />;
  }

  if (isLoading) {
    return <StateCard message="Loading applicants…" />;
  }

  if (isError) {
    return (
      <StateCard message="Couldn't load applicants. You may not have access to this task." />
    );
  }

  return <ApplicantsList taskId={taskId} applicants={data ?? []} />;
}
