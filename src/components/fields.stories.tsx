import preview from "#.storybook/preview";
import { fieldDefs } from "#.storybook/fixtures/patterns";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { ReadOnly } from "@/components/brand-values";
import { describedBy, Field, FieldInputs, Fold, Property, readFieldValues, UploadFieldsDialog } from "@/components/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** What the forms below hand on, heard by the plays; cleared before each story. */
const submitted = fn();
const cancelled = fn();

const meta = preview.meta({
  title: "App/Patterns/Fields",
  beforeEach: () => {
    submitted.mockClear();
    cancelled.mockClear();
  },
  component: Field,
  args: { label: "Title", htmlFor: "f-title", hint: "Shown on portals and in search.", error: "", children: null },
  argTypes: { children: { control: false } },
  render: (args) => (
    <Field {...args} className="max-w-sm">
      <Input id="f-title" defaultValue="Acme logo, primary" aria-invalid={!!args.error || undefined} aria-describedby={describedBy("f-title", args)} />
    </Field>
  ),
});

/** A label over its control, a hint under it. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Title")).toHaveAccessibleDescription("Shown on portals and in search.");
  },
});

/** Refused: the error in place, said at once (role=alert), and named by the control. */
export const WithError = meta.story({
  args: { error: "A title can't be empty." },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("A title can't be empty.");
    await expect(canvas.getByLabelText("Title")).toHaveAccessibleDescription(/A title can't be empty/);
  },
});

/** A document's property: label left, value right, read as text until pointed at. */
export const PropertyRow = meta.story({
  render: () => (
    <div className="grid max-w-md gap-1">
      <Property label="Title" htmlFor="p-title" text="Acme logo, primary">
        <Input id="p-title" defaultValue="Acme logo, primary" />
      </Property>
      <Property label="Alt text" htmlFor="p-alt" text="" hint="What a screen reader says for it.">
        <Input id="p-alt" placeholder="Add alt text" />
      </Property>
    </div>
  ),
});

/** Read only (a viewer): the text in place of the control, and nothing for what is empty. */
export const PropertyReadOnly = meta.story({
  render: () => (
    <ReadOnly value>
      <div className="grid max-w-md gap-1">
        <Property label="Title" htmlFor="r-title" text="Acme logo, primary">
          <Input id="r-title" />
        </Property>
        <Property label="Alt text" htmlFor="r-alt" text="">
          <Input id="r-alt" />
        </Property>
      </div>
    </ReadOnly>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Acme logo, primary")).toBeInTheDocument();
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
    await expect(canvas.queryByText("Alt text")).not.toBeInTheDocument();
  },
});

/** A section folded to what is in it, remembered per viewer. */
export const Folded = meta.story({
  beforeEach: () => localStorage.removeItem("artbucket:fold:story-rights"),
  render: () => (
    <div className="max-w-md">
      <Fold title="Rights" summary="Licensed until 31 Dec 2027" remember="story-rights">
        <Field label="License" htmlFor="fold-license">
          <Input id="fold-license" defaultValue="Stock, editorial and web" />
        </Field>
      </Fold>
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByLabelText("License")).not.toBeVisible();
    await userEvent.click(canvas.getByText("Rights"));
    await expect(canvas.getByLabelText("License")).toBeVisible();
    await waitFor(() => expect(localStorage.getItem("artbucket:fold:story-rights")).toBe("true"));
  },
});

/** The custom fields form, the way the asset editor submits it (readFieldValues). */
const Form = ({ rows, onSubmit, ...props }: Partial<React.ComponentProps<typeof FieldInputs>> & { onSubmit: (v: unknown) => void }) => (
  <form
    className="grid max-w-md gap-4"
    onSubmit={(e) => {
      e.preventDefault();
      onSubmit(readFieldValues(new FormData(e.currentTarget), fieldDefs));
    }}
  >
    <FieldInputs defs={fieldDefs} rows={rows} {...props} />
    <Button type="submit" className="w-fit">
      Save
    </Button>
  </form>
);

/** Every type the app renders: text, number, date, a select (one of a list) and yes or no, required or not. */
export const CustomFields = meta.story({
  render: () => <Form onSubmit={submitted} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: /Campaign/ }), "Spring 2027");
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Views" }), "12500");
    await userEvent.type(canvas.getByLabelText("Shot on"), "2026-04-12");
    await userEvent.click(canvas.getByRole("combobox", { name: "Channel" }));
    await userEvent.click(await screen.findByRole("option", { name: "Social" }));
    const approved = canvas.getByRole("radiogroup", { name: "Approved" });
    await userEvent.click(within(approved).getByRole("radio", { name: "Yes" }));
    await userEvent.click(within(canvas.getByRole("radiogroup", { name: "Embargoed" })).getByRole("radio", { name: "No" }));
    await userEvent.click(canvas.getByRole("button", { name: "Save" }));
    await expect(submitted).toHaveBeenCalledWith({
      campaign: "Spring 2027",
      views: 12500,
      shot_on: "2026-04-12",
      channel: "Social",
      approved: true,
      embargo: false,
    });
  },
});

/** As property rows (the asset panel), with values, one inherited from a collection, and an error. */
export const AsRows = meta.story({
  render: () => (
    <Form
      rows
      onSubmit={() => {}}
      values={{ campaign: "Spring 2027", views: 12500, approved: true }}
      inherited={{ channel: "Print", embargo: true }}
      sources={{ channel: "Spring campaign", embargo: "Spring campaign" }}
      errors={{ shot_on: "Not a date." }}
    />
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByText("from Spring campaign").length).toBeGreaterThan(0);
    await expect(canvas.getByRole("alert")).toHaveTextContent("Not a date.");
  },
});

/** Read only: each value as the panel says it (Yes, a local date, 12,500), the empty ones left out. */
export const ReadOnlyRows = meta.story({
  render: () => (
    <ReadOnly value>
      <div className="grid max-w-md gap-1">
        <FieldInputs defs={fieldDefs} rows values={{ campaign: "Spring 2027", views: 12500, approved: true }} />
      </div>
    </ReadOnly>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("12,500")).toBeInTheDocument();
    await expect(canvas.getByText("Yes")).toBeInTheDocument();
    await expect(canvas.queryByText("Channel")).not.toBeInTheDocument();
  },
});

/** Before an upload, when the schema has required fields: the values apply to every file in the batch. */
export const UploadDialog = meta.story({
  render: () => <UploadFieldsDialog defs={fieldDefs} count={3} inherited={{ channel: "Print" }} from="Spring campaign" onSubmit={submitted} onCancel={cancelled} />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Describe these 3 files" });
    await userEvent.type(within(dialog).getByRole("textbox", { name: /Campaign/ }), "Spring 2027");
    await userEvent.click(within(within(dialog).getByRole("radiogroup", { name: "Approved" })).getByRole("radio", { name: "Yes" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Upload" }));
    // A complete set, without the nulls that mean "clear": the inherited channel isn't sent, the collection applies it.
    await waitFor(() => expect(submitted).toHaveBeenCalledWith({ campaign: "Spring 2027", approved: true }));
  },
});

/** One file, and Cancel. */
export const UploadDialogCancel = meta.story({
  render: () => <UploadFieldsDialog defs={fieldDefs.slice(0, 1)} count={1} inherited={{}} onSubmit={submitted} onCancel={cancelled} />,
  play: async ({ userEvent }) => {
    const dialog = await screen.findByRole("dialog", { name: "Describe this file" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await expect(cancelled).toHaveBeenCalled();
    await expect(submitted).not.toHaveBeenCalled();
  },
});
