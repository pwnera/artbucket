"use client";

import Link from "next/link";
import { useEffect, useTransition } from "react";
import { useBrand } from "@/components/brand";
import { Card } from "@/components/sign-in";
import { Button } from "@/components/ui/button";

/**
 * A failure outside a page's own boundary: the app's layout (who is looking,
 * the sidebar's data) or a page outside the app. Still branded, since the
 * root layout, and its brand, rendered.
 */
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const brand = useBrand();
  useEffect(() => console.error(error), [error]);
  // Retrying fetches the page again: the button says so until it lands.
  const [trying, tryAgain] = useTransition();
  return (
    <Card
      title="Something went wrong"
      lead={
        <>
          The server didn&apos;t answer as it should. Try again in a moment.
          {error.digest && <span className="mt-2 block font-mono text-xs">Reference {error.digest}</span>}
        </>
      }
    >
      <div className="grid gap-2">
        <Button pending={trying} onClick={() => tryAgain(retry)}>
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Go to {brand.name}</Link>
        </Button>
      </div>
    </Card>
  );
}
