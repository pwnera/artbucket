"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** A form's submit button, pending while its `<form action>` runs: no busy state to thread through. */
export function SubmitButton({ pending, ...props }: React.ComponentProps<typeof Button>) {
  const status = useFormStatus();
  return <Button type="submit" pending={pending || status.pending} {...props} />;
}
