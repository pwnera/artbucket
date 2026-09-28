import Link from "next/link";
import { Card } from "@/components/sign-in";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/sidebar";

/** Any URL nothing here answers, outside the app's frame: the brand, and the way in. */
export default async function NotFound() {
  const b = await brand();
  return (
    <Card title="Nothing here" lead="This page doesn't exist, or it moved. Check the link, or start from the top.">
      <Button asChild className="w-full">
        <Link href="/">Go to {b.name}</Link>
      </Button>
    </Card>
  );
}
