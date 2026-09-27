"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { IconLock, IconShare, IconUpload } from "@tabler/icons-react";
import { Snippet } from "@/components/agent-access";
import { send } from "@/components/collections";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ShareTarget = {
  kind: "view" | "upload";
  collection?: { id: string; name: string };
  asset?: { id: string; name: string };
};

export type ShareLink = {
  id: string;
  kind: "view" | "upload";
  name: string | null;
  target: { type: "collection" | "asset" | "workspace"; id: string | null; label: string | null };
  url: string;
  password: boolean;
  expiresAt: string | null;
  expired: boolean;
  createdBy: string;
  createdAt: string;
};

/**
 * Make a link for someone without an account: to look at a collection or an
 * asset and download it, or to send files into a collection for review. It
 * can expire and ask for a password; Team lists every link, to revoke one.
 */
export function ShareDialog({ target, onClose }: { target: ShareTarget; onClose: () => void }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<ShareLink | null>(null);
  const what = target.collection?.name ?? target.asset?.name ?? "the workspace";
  const upload = target.kind === "upload";

  async function make(form: FormData) {
    const expires = String(form.get("expires") ?? "");
    const password = String(form.get("password") ?? "");
    setBusy(true);
    const link = await send("POST", "/api/v1/shares", {
      kind: target.kind,
      collection: target.collection?.id,
      asset: target.asset?.id,
      name: String(form.get("name") ?? "").trim() || undefined,
      password: password || undefined,
      // The last day it works, through the end of that day, where the person making it is.
      expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : undefined,
    });
    setBusy(false);
    if (link) setMade(link);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {upload ? <IconUpload className="size-5" /> : <IconShare className="size-5" />}
            {upload ? `Collect uploads into ${what}` : `Share ${what}`}
          </DialogTitle>
          <DialogDescription>
            {upload
              ? "Anyone with the link can send files, without an account. They land in Review, not in the library, until someone approves them."
              : "Anyone with the link can see and download its approved assets, without an account."}
          </DialogDescription>
        </DialogHeader>
        {made ? (
          <div className="grid gap-3">
            <Snippet text={made.url} what="the link" />
            <p className="text-muted-foreground text-sm">
              {made.password && (
                <>
                  <IconLock className="mr-1 inline size-3.5" />
                  It asks for the password.{" "}
                </>
              )}
              {made.expiresAt ? `It works until ${new Date(made.expiresAt).toLocaleDateString()}.` : "It works until you revoke it."}{" "}
              Every link is in{" "}
              <Link href="/team?tab=sharing" className="underline underline-offset-2">
                Team
              </Link>
              .
            </p>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void make(new FormData(e.currentTarget));
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor={`${id}-name`}>What they see it called</Label>
              <Input id={`${id}-name`} name="name" maxLength={120} defaultValue={upload ? `Uploads for ${what}` : what} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor={`${id}-expires`}>Last day</Label>
                <Input id={`${id}-expires`} name="expires" type="date" min={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${id}-password`}>Password</Label>
                <Input id={`${id}-password`} name="password" type="password" minLength={4} autoComplete="new-password" placeholder="None" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Make link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
