"use client";

import { Button } from "@/components/ui/button";

/** A panel whose data didn't load: said in its place, with another try, never a skeleton that waits forever or an empty that reads as "none". */
export function RetryLine({ what, retry }: { what: string; retry: () => void }) {
  return (
    <p role="alert" className="text-muted-foreground flex flex-wrap items-center gap-x-2 py-1 text-xs">
      Couldn&apos;t load {what}.
      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={retry}>
        Retry
      </Button>
    </p>
  );
}
