import preview from "#.storybook/preview";
import { recorder } from "#.storybook/fixtures/brands";
import { fieldDefs } from "#.storybook/fixtures/patterns";
import { failing } from "#.storybook/mocks";
import { http, HttpResponse } from "msw";
import { useCallback, useEffect, useState } from "react";
import { expect, fn, screen, waitFor, within } from "storybook/test";
import { FieldsEditor } from "@/components/field-manager";
import type { FieldDef } from "@/lib/fields";

const sent = recorder();

/**
 * The project's fields as the API holds them: what a story saves changes what GET answers, and each request is
 * kept in `sent` to assert.
 */
let db: FieldDef[] = [];
const server = () => {
  const keep = async (request: Request) => {
    const url = new URL(request.url);
    const text = await request.text();
    const body = text ? JSON.parse(text) : null;
    sent.calls.push({ method: request.method, path: url.pathname, body });
    return body;
  };
  const at = (f: FieldDef) => (f as FieldDef & { position?: number }).position ?? 0;
  return [
    http.get("/api/v1/fields", () => HttpResponse.json({ data: [...db].sort((a, b) => at(a) - at(b)) })),
    http.post("/api/v1/fields", async ({ request }) => {
      const body = await keep(request);
      db = [...db, body];
      return HttpResponse.json({ data: body });
    }),
    http.patch("/api/v1/fields/:key", async ({ request, params }) => {
      const body = await keep(request);
      db = db.map((f) => (f.key === params.key ? { ...f, ...body } : f));
      return HttpResponse.json({ data: db.find((f) => f.key === params.key) });
    }),
    http.delete("/api/v1/fields/:key", async ({ request, params }) => {
      await keep(request);
      db = db.filter((f) => f.key !== params.key);
      return HttpResponse.json({ data: { deleted: true } });
    }),
  ];
};

/** As Settings draws it: the fields from the API, read again after each change (the page's refresh). */
function Live() {
  const [fields, setFields] = useState<FieldDef[] | null>(null);
  const load = useCallback(() => void fetch("/api/v1/fields").then(async (r) => setFields((await r.json()).data)), []);
  useEffect(load, [load]);
  return fields && <FieldsEditor fields={fields} onChanged={load} />;
}

/**
 * The project's custom fields (Settings, Fields): add, rename, require, reorder and delete, each saved as it
 * changes through /api/v1/fields. A field's type is fixed once made. The order is the order every asset's panel
 * and the upload form show.
 */
const meta = preview.meta({
  title: "App/Features/Settings/Fields",
  component: FieldsEditor,
  args: { fields: fieldDefs, onChanged: fn() },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
  beforeEach: ({ msw }) => {
    sent.reset();
    db = fieldDefs.map((f, position) => ({ ...f, position }));
    msw.use(...server());
  },
});

const rows = (canvas: ReturnType<typeof within>) => within(canvas.getAllByRole("list")[0]);
const names = (canvas: ReturnType<typeof within>) => rows(canvas).getAllByRole("textbox").map((i) => (i as HTMLInputElement).value);

/** Every type a field can be, required and not, then the form that adds one. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(rows(canvas).getAllByRole("listitem")).toHaveLength(fieldDefs.length);
    await expect(canvas.getByRole("switch", { name: "Campaign required" })).toBeChecked();
    // Only a pick list edits its options.
    await expect(canvas.getAllByRole("button", { name: "Add options" })).toHaveLength(1);
  },
});

/** None yet: what they are for, and the form. */
export const Empty = meta.story({
  args: { fields: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("No custom fields yet")).toBeInTheDocument();
  },
});

const TYPES = [
  ["Campaign", "Text", "text", "campaign"],
  ["Views", "Number", "number", "views"],
  ["Shot on", "Date", "date", "shot_on"],
  ["Approved", "Yes / no", "boolean", "approved"],
] as const;

/** One of each type, each joining the list as it is saved: its name gives its key; a pick list needs its options first. */
export const AddEachType = meta.story({
  render: () => <Live />,
  beforeEach: () => void (db = []),
  play: async ({ canvas, userEvent }) => {
    // The form starts again after each add: ask for its controls each time.
    const name = () => canvas.getByRole("textbox", { name: "Name" });
    const add = () => canvas.getByRole("button", { name: "Add field" });
    const pick = async (type: string) => {
      await userEvent.click(canvas.getByRole("combobox", { name: "Type" }));
      await userEvent.click(await screen.findByRole("option", { name: type }));
      await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    };
    await expect(await canvas.findByText("No custom fields yet")).toBeInTheDocument();
    await expect(add()).toBeDisabled();
    for (const [label, type, kind, key] of TYPES) {
      await userEvent.type(name(), label);
      await expect(canvas.getByText(`Stored as ${key}`)).toBeInTheDocument();
      await pick(type);
      await userEvent.click(add());
      await waitFor(() => expect(names(canvas).at(-1)).toBe(label));
      await expect(sent.last("POST")?.body).toMatchObject({ key, label, type: kind, required: false });
    }

    // A pick list: refused in our words until it has an option, then sent with them, required.
    await userEvent.type(name(), "Channel");
    await pick("Pick list");
    await userEvent.click(add());
    await expect(await screen.findByText("Add at least one option")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Options" }));
    await userEvent.keyboard("Web{Enter}Print{Enter}{Escape}");
    await userEvent.click(canvas.getByRole("switch", { name: "Required at upload" }));
    await userEvent.click(add());
    await waitFor(() => expect(names(canvas)).toEqual(["Campaign", "Views", "Shot on", "Approved", "Channel"]));
    await expect(sent.last("POST")).toEqual({ path: "/api/v1/fields", body: { key: "channel", label: "Channel", type: "select", options: ["Web", "Print"], required: true, position: 4 } });
  },
});

/** A name that starts with a digit has no key to store under: said, and nothing to add. */
export const NameWithoutKey = meta.story({
  args: { fields: [] },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole("textbox", { name: "Name" }), "2026");
    await expect(canvas.getByText("Start the name with a letter")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add field" })).toBeDisabled();
  },
});

/** Reorder from the keyboard: the row moves at once, then every field's position is saved and the list read again. */
export const ReorderWithKeyboard = meta.story({
  render: () => <Live />,
  play: async ({ canvas, userEvent }) => {
    const up = await canvas.findByRole("button", { name: "Move Views up" });
    await expect(canvas.getByRole("button", { name: "Move Campaign up" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: `Move ${fieldDefs.at(-1)!.label} down` })).toBeDisabled();
    up.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(names(canvas).slice(0, 2)).toEqual(["Views", "Campaign"]));
    await waitFor(() => expect(sent.calls.filter((c) => c.method === "PATCH")).toHaveLength(fieldDefs.length));
    await expect(sent.calls.find((c) => c.path === "/api/v1/fields/views")?.body).toEqual({ position: 0 });
    await expect(sent.calls.find((c) => c.path === "/api/v1/fields/campaign")?.body).toEqual({ position: 1 });
    // Down again from the keyboard, on the row that moved.
    canvas.getByRole("button", { name: "Move Views down" }).focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(names(canvas).slice(0, 2)).toEqual(["Campaign", "Views"]));
  },
});

/** Rename in place: leaving the field saves (Enter too), and a check says so. */
export const Rename = meta.story({
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole("textbox", { name: "Name of campaign" });
    await userEvent.clear(input);
    // Tab, not Enter: user-event counts Radix's hidden switch input and won't submit a form of two inputs, as a browser does.
    await userEvent.type(input, "Campaign name");
    await userEvent.tab();
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/fields/campaign", body: { label: "Campaign name" } }));
    await expect(await canvas.findByText("Saved")).toBeInTheDocument();
  },
});

/** Required or not, saved as it flips. */
export const ToggleRequired = meta.story({
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("switch", { name: "Views required" }));
    await waitFor(() => expect(sent.last("PATCH")).toEqual({ path: "/api/v1/fields/views", body: { required: true } }));
  },
});

/** Delete asks first, since its value goes from every asset and collection; then the row goes. */
export const DeleteWithConfirm = meta.story({
  render: () => <Live />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Delete Campaign" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Delete Campaign?" });
    await expect(within(confirm).getByText("Its value is removed from every asset and collection.")).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(sent.last("DELETE")).toEqual({ path: "/api/v1/fields/campaign", body: null }));
    await expect(await screen.findByText("Deleted Campaign")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(names(canvas)).not.toContain("Campaign"));
  },
});

/** Refused by the server: the switch goes back, and the reason is toasted. */
export const Refused = meta.story({
  beforeEach: ({ msw }) => void msw.use(failing),
  play: async ({ canvas, userEvent }) => {
    const toggle = canvas.getByRole("switch", { name: "Views required" });
    await userEvent.click(toggle);
    await expect(await screen.findByText("That name is taken")).toBeInTheDocument();
    await waitFor(() => expect(toggle).not.toBeChecked());
  },
});

export const Phone = meta.story({ globals: { viewport: { value: "phone" } } });

export const Dark = meta.story({ globals: { theme: "dark" } });
