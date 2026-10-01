"use client";

import Link from "next/link";
import { useEffect, useTransition } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import { AppHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/**
 * A page that threw, inside the frame: the sidebar and ⌘K stay, so there is
 * always a way on. `retry` fetches the page again rather than only redrawing
 * it, since what failed is usually the server's half.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => console.error(error), [error]);
  // Retrying fetches the page again: the button says so until it lands.
  const [trying, tryAgain] = useTransition();
  return (
    <>
      <AppHeader trail={[{ label: "Something went wrong" }]} />
      <div className="flex flex-1 p-4 md:p-6">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconAlertTriangle />
            </EmptyMedia>
            <EmptyTitle>This page didn&apos;t load</EmptyTitle>
            <EmptyDescription>
              Something went wrong on our side, not yours. Try again; the rest of the app still works.
              {error.digest && <span className="mt-2 block font-mono text-xs">Reference {error.digest}</span>}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            <Button pending={trying} onClick={() => tryAgain(retry)}>
              Try again
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Go to Assets</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    </>
  );
}
