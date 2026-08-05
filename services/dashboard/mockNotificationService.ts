import type { Notification } from "@/types/dashboard";

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "notif-1",
    title: "New task available: Design a simple logo concept",
    description: "A new Design task matching your interests was just posted.",
    timestamp: "5 minutes ago",
    type: "task",
    isRead: false,
  },
  {
    id: "notif-2",
    title: "Payment received",
    description:
      "You received 0.75 USDC for Write a 100-word product description.",
    timestamp: "2 hours ago",
    type: "payment",
    isRead: false,
  },
  {
    id: "notif-3",
    title: "Wallet connected",
    description: "Your wallet was successfully connected to Arc Testnet.",
    timestamp: "3 hours ago",
    type: "wallet",
    isRead: false,
  },
  {
    id: "notif-4",
    title: "Welcome to Nano Task Marketplace",
    description: "Complete your profile to start applying for tasks.",
    timestamp: "1 day ago",
    type: "system",
    isRead: false,
  },
  {
    id: "notif-5",
    title: "Application accepted",
    description:
      "Your application for Summarize 3 competitor pricing pages was accepted.",
    timestamp: "1 day ago",
    type: "task",
    isRead: true,
  },
  {
    id: "notif-6",
    title: "Payout pending",
    description: "A payout of 3.50 USDC is now pending confirmation.",
    timestamp: "2 days ago",
    type: "payment",
    isRead: true,
  },
  {
    id: "notif-7",
    title: "Network switched",
    description: "You switched networks to Arc Testnet.",
    timestamp: "3 days ago",
    type: "wallet",
    isRead: true,
  },
  {
    id: "notif-8",
    title: "New feature: Earnings dashboard",
    description:
      "Track your USDC earnings and payout history from your dashboard.",
    timestamp: "4 days ago",
    type: "system",
    isRead: true,
  },
  {
    id: "notif-9",
    title: "Task marked complete",
    description: "You marked Label 50 images for model training as complete.",
    timestamp: "5 days ago",
    type: "task",
    isRead: true,
  },
];

export function getNotifications(): Notification[] {
  return MOCK_NOTIFICATIONS;
}
