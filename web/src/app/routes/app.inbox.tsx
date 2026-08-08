import { createFileRoute } from "@tanstack/react-router";
import { InboxPage } from "@/features/inbox/InboxPage";

export const Route = createFileRoute("/app/inbox")({ component: InboxPage });
