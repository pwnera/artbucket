import Link from "next/link";
import { IconBook, IconMapQuestion, IconPhoto } from "@/components/icons";
import { AppHeader } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** A stale link from inside the app (a deleted brand, a settings section that moved): the frame stays, with the two ways back. */
export default function AppNotFound() {
  return (
    <>
      <AppHeader trail={[{ label: "Not found" }]} />
      <div className="flex flex-1 p-4 md:p-6">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconMapQuestion />
            </EmptyMedia>
            <EmptyTitle>That brand or page isn&apos;t here</EmptyTitle>
            <EmptyDescription>It was deleted or renamed, or the link has a typo.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            <Button asChild>
              <Link href="/">
                <IconPhoto /> Assets
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/brand">
                <IconBook /> Guidelines
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    </>
  );
}
