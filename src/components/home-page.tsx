"use client";

import { useNavigate } from "@/components/app-sidebar";
import { useCan } from "@/components/can";
import { ExploreStart } from "@/components/explore-start";
import { AppHeader } from "@/components/page";
import { SetupChecklist } from "@/components/setup-checklist";
import { useShell } from "@/components/shell";

type Latest = { id: string; filename: string; createdAt: string; metadata?: { title?: string } | null };

/** Home (/): Explore's start, with the setup card; uploading from it opens Assets to run there. */
export function HomePage({ latest, stocked }: { latest: Latest[]; stocked: boolean }) {
  const { collections, searches } = useShell();
  const can = useCan();
  const navigate = useNavigate();
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <AppHeader trail={[{ label: "Home" }]} />
      <div className="flex min-w-0 flex-1 flex-col gap-4 px-4 pb-4 md:px-6 md:pb-6">
        <ExploreStart
          latest={latest}
          collections={collections}
          searches={searches}
          setup={<SetupChecklist uploaded={stocked} onUpload={can("project.upload") ? () => navigate("/assets?add=files") : undefined} />}
        />
      </div>
    </div>
  );
}
