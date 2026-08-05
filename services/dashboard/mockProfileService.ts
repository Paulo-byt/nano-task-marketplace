import type { ProfileOverview } from "@/types/dashboard";

const MOCK_PROFILE_OVERVIEW: ProfileOverview = {
  memberSince: "January 2026",
  tasksCompleted: 12,
  tasksInProgress: 2,
  reputationScore: 4.8,
};

export function getProfileStats(): ProfileOverview {
  return MOCK_PROFILE_OVERVIEW;
}
