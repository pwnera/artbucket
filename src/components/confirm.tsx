"use client";

import { toast } from "sonner";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * Are you sure, then do it here: the action stays pending while `run` works,
 * and the dialog closes only when it worked. `run` resolves to send()'s
 * result; null or false keeps the dialog open, with its context, so a failed
 * delete can be retried. `children` is the trigger; or control it with `open`.
 */
export function Confirm({
  title,
  says,
  action = "Remove",
  destructive = true,
  run,
  open,
  onOpenChange,
  children,
}: {
  title: React.ReactNode;
  says?: React.ReactNode;
  action?: string;
  destructive?: boolean;
  run: () => unknown;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const [inner, setInner] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (o: boolean) => {
    if (open === undefined) setInner(o);
    onOpenChange?.(o);
  };

  async function go() {
    setBusy(true);
    // A run that throws (send() never does) still says so, and the dialog stays for another try.
    const ok = await Promise.resolve()
      .then(run)
      .catch(() => {
        toast.error("That didn't work. Try again.");
        return null;
      });
    setBusy(false);
    if (ok !== null && ok !== false) set(false);
  }

  return (
    // Not while it runs: Esc would hide a request that is still going.
    <AlertDialog open={open ?? inner} onOpenChange={(o) => !busy && set(o)}>
      {children && <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>}
      {/* Without `says` there is nothing to describe it; tell Radix so. */}
      <AlertDialogContent {...(!says && { "aria-describedby": undefined })}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {says && <AlertDialogDescription>{says}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {/* A plain button: Radix's Action closes before the work runs. */}
          <Button variant={destructive ? "destructive" : "default"} pending={busy} onClick={go}>
            {action}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
