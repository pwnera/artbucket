import preview from "#.storybook/preview";
import { expect, fn } from "storybook/test";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Text over several lines. It grows with what is typed (`field-sizing: content`), from `rows` up. */
const meta = preview.meta({
  title: "App/Primitives/Textarea",
  component: Textarea,
  args: {
    "aria-label": "Email footer",
    placeholder: "Acme Inc, 1 Main Street",
    rows: 2,
    disabled: false,
    readOnly: false,
    "aria-invalid": false,
    onChange: fn(),
    className: "max-w-sm",
  },
});

export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    const box = canvas.getByRole("textbox", { name: "Email footer" });
    const before = box.getBoundingClientRect().height;
    await userEvent.type(box, "Acme Inc{Enter}1 Main Street{Enter}Springfield{Enter}Unsubscribe any time");
    await expect(box).toHaveValue("Acme Inc\n1 Main Street\nSpringfield\nUnsubscribe any time");
    await expect(args.onChange).toHaveBeenCalled();
    // It grew to fit the four lines.
    await expect(box.getBoundingClientRect().height).toBeGreaterThan(before);
  },
});

export const Invalid = meta.story({
  render: () => (
    <div className="grid max-w-sm gap-2">
      <Label htmlFor="voice">Voice</Label>
      <Textarea id="voice" aria-invalid aria-describedby="voice-error" defaultValue="" />
      <p id="voice-error" className="text-destructive text-xs">
        Say how the brand sounds, in a sentence or two.
      </p>
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Voice" })).toBeInvalid();
  },
});

export const Disabled = meta.story({ args: { disabled: true } });

export const ReadOnly = meta.story({
  args: { readOnly: true, defaultValue: "Warm, plain and brief. We say what a thing does, then stop." },
});

export const LongText = meta.story({
  args: {
    defaultValue:
      "Warm, plain and brief. We say what a thing does, then stop. We write for the person in a hurry: the first line answers, the rest explains. We never use jargon where a common word does the job, and we never promise what the product doesn't do.",
  },
});

export const Dark = LongText.extend({ globals: { theme: "dark" } });
