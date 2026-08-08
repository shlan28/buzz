import { createFileRoute } from "@tanstack/react-router";

import { PairPage } from "@/features/pairing/PairPage";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";

export const Route = createFileRoute("/app/pair")({
  component: PairRoute,
});

function PairRoute() {
  return (
    <DesktopParityAppShell>
      <PairPage />
    </DesktopParityAppShell>
  );
}
