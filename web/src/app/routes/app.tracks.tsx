import { createFileRoute } from "@tanstack/react-router";
import { TracksPage } from "@/features/tracks/TracksPage";
export const Route = createFileRoute("/app/tracks")({ component: TracksPage });
