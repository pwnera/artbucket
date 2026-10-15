import preview from "#.storybook/preview";
import { expect, fn, waitFor } from "storybook/test";
import { IconLock, IconUsers, IconWorld } from "@/components/icons";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const DOORS = { public: "Anyone with the address", password: "Anyone with the password", members: "Members only" } as const;

/** One choice of a few, all in view. More than six, or a long list, is a Select. */
const meta = preview.meta({
  title: "App/Primitives/Radio group",
  component: RadioGroup,
  subcomponents: { RadioGroupItem },
  args: { defaultValue: "public", disabled: false, onValueChange: fn(), "aria-label": "Who gets in" },
  render: (args) => (
    <RadioGroup {...args}>
      {Object.entries(DOORS).map(([value, label]) => (
        <div key={value} className="flex items-center gap-2">
          <RadioGroupItem value={value} id={`door-${value}`} />
          <Label htmlFor={`door-${value}`}>{label}</Label>
        </div>
      ))}
    </RadioGroup>
  ),
});

/** Arrow keys move and pick; Tab enters on the picked one and leaves the group. */
export const Playground = meta.story({
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.getByRole("radiogroup", { name: "Who gets in" })).toBeInTheDocument();
    await expect(canvas.getByRole("radio", { name: DOORS.public })).toBeChecked();
    // The label picks it too.
    await userEvent.click(canvas.getByText(DOORS.members));
    await expect(canvas.getByRole("radio", { name: DOORS.members })).toBeChecked();
    await expect(args.onValueChange).toHaveBeenLastCalledWith("members");
    canvas.getByRole("radio", { name: DOORS.members }).focus();
    // Held as a person holds it: Radix moves focus a tick after the keydown and picks only while the arrow is down.
    await userEvent.keyboard("{ArrowUp>}");
    await waitFor(() => expect(canvas.getByRole("radio", { name: DOORS.password })).toBeChecked());
    await userEvent.keyboard("{/ArrowUp}");
    await expect(canvas.getByRole("radio", { name: DOORS.password })).toHaveFocus();
  },
});

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByText(DOORS.members));
    await expect(canvas.getByRole("radio", { name: DOORS.public })).toBeChecked();
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
});

const CARDS = [
  { value: "public", icon: IconWorld, label: "Public", hint: "Anyone with the address" },
  { value: "password", icon: IconLock, label: "Password", hint: "One password for everyone" },
  { value: "members", icon: IconUsers, label: "Members", hint: "Signed in, invited" },
];

/** The card is the choice: the item hides inside a label, and the card shows checked and focus. */
export const Cards = meta.story({
  render: (args) => (
    <RadioGroup {...args} className="grid max-w-xl gap-2 sm:grid-cols-3">
      {CARDS.map((c) => (
        <label
          key={c.value}
          className="has-data-[state=checked]:border-primary has-data-[state=checked]:bg-primary/5 has-focus-visible:ring-ring/50 flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm transition-colors has-focus-visible:ring-[3px]"
        >
          <RadioGroupItem value={c.value} className="sr-only" />
          <c.icon className="text-muted-foreground size-4" />
          <span className="font-medium">{c.label}</span>
          <span className="text-muted-foreground text-xs">{c.hint}</span>
        </label>
      ))}
    </RadioGroup>
  ),
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Members"));
    await expect(canvas.getByRole("radio", { name: /Members/ })).toBeChecked();
    await expect(args.onValueChange).toHaveBeenLastCalledWith("members");
  },
});

export const Dark = meta.story({ globals: { theme: "dark" } });
