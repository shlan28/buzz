import { createFileRoute } from "@tanstack/react-router";
import { ChannelsPage } from "@/features/channels/ChannelsPage";

export const Route = createFileRoute("/app/channels")({
  component: ChannelsPage,
});
