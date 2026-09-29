"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  IconAdjustments,
  IconArrowLeft,
  IconBookmark,
  IconBucketDroplet,
  IconCloudUpload,
  IconDots,
  IconDownload,
  IconFolder,
  IconLayoutGrid,
  IconList,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { Confirm } from "@/components/confirm";
import { CopyButton } from "@/components/copy-button";
import { IconButton } from "@/components/icon-button";
import { SaveStatus } from "@/components/save-status";
import { Kbd } from "@/components/ui/kbd";
import { contrast } from "@/lib/color";
import { track } from "@/lib/saving";
import { undoable } from "@/lib/undo";
import { AppIcon, Logo, ThemeToggle } from "@/components/brand";
import { Combobox, MultiCombobox } from "@/components/combobox";
import { FacetFilter } from "@/components/facet-filter";
import { Field } from "@/components/fields";
import { GridSkeleton } from "@/components/skeletons";
import { AssetCard, type Asset } from "@/components/gallery";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const COLORS = [
  "background",
  "foreground",
  "card",
  "primary",
  "secondary",
  "muted",
  "muted-foreground",
  "accent",
  "destructive",
  "border",
  "input",
  "ring",
  "highlight",
];

const TEXT = ["foreground", "muted-foreground", "primary-ink", "success", "warning"];
const SURFACES = ["background", "card", "muted", "sidebar"];

/** Each text token on each surface it sits on, in one mode whatever the app's, with its ratio (lib/color.test.ts holds them at 4.5). */
function Grades({ mode }: { mode: "light" | "dark" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState<Record<string, string>>({});
  useEffect(() => {
    const s = getComputedStyle(ref.current!);
    setV(Object.fromEntries([...TEXT, ...SURFACES].map((k) => [k, s.getPropertyValue(`--${k}`).trim()])));
  }, []);
  return (
    <div ref={ref} className={`${mode} bg-background text-foreground overflow-x-auto rounded-md border p-3 text-xs`}>
      <table className="w-full">
        <caption className="pb-2 text-start font-medium">{mode === "light" ? "Light" : "Dark"}</caption>
        <thead>
          <tr>
            <th />
            {SURFACES.map((s) => (
              <th key={s} scope="col" className="text-muted-foreground px-2 pb-1 text-start font-normal">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TEXT.map((t) => (
            <tr key={t}>
              <th scope="row" className="pe-2 text-start font-mono font-normal">
                --{t}
              </th>
              {SURFACES.map((s) => (
                <td key={s} className="px-2 py-1 font-medium tabular-nums" style={{ background: `var(--${s})`, color: `var(--${t})` }}>
                  {v[t] && v[s] ? `${contrast(v[t], v[s]).toFixed(1)}:1` : "..."}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ICONS = [
  IconBucketDroplet,
  IconUpload,
  IconCloudUpload,
  IconDownload,
  IconSearch,
  IconPhoto,
  IconFolder,
  IconBookmark,
  IconAdjustments,
  IconPencil,
  IconTrash,
  IconPlus,
  IconDots,
  IconLayoutGrid,
  IconList,
];

const SAMPLE: Asset = {
  id: "sample",
  filename: "spring-campaign-hero-final-v3.psd",
  mime: "application/octet-stream",
  size: 18_400_000,
  width: 4000,
  height: 3000,
  probe: null,
  tags: ["brand", "spring", "hero", "print"],
  fields: {},
  inherited: {},
  collections: [],
  status: "active",
  state: "active",
  stackId: null,
  version: null,
  current: false,
  proposedBy: null,
  reviewNote: null,
  proposedTags: [],
  rights: null,
  origin: null,
  parentAssetId: null,
  generator: null,
  prompt: null,
  c2pa: null,
  supersededBy: null,
  metadata: null,
  createdAt: "2026-09-27T00:00:00Z",
  updatedAt: "2026-09-27T00:00:00Z",
};

const TAGS = ["brand", "spring", "hero", "print", "social", "web", "logo", "draft"].map((value, i) => ({
  value,
  hint: 40 - i * 4,
}));

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="grid gap-6">{children}</CardContent>
      </Card>
    </section>
  );
}

const SECTIONS = [
  ["brand", "Brand"],
  ["color", "Color"],
  ["type", "Typography"],
  ["icons", "Icons"],
  ["buttons", "Buttons"],
  ["badges", "Badges"],
  ["states", "States"],
  ["keys", "Keys"],
  ["focus", "Focus"],
  ["inputs", "Inputs"],
  ["autocomplete", "Autocomplete"],
  ["filters", "Filters"],
  ["overlays", "Overlays"],
  ["feedback", "Feedback"],
  ["navigation", "Navigation"],
  ["cards", "Asset card"],
] as const;

export default function DesignSystem() {
  const [facet, setFacet] = useState<string[]>(["brand"]);
  const [pending, setPending] = useState(false);
  return (
    <div className="min-h-dvh">
      <header className="bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-4 backdrop-blur md:px-6">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/" aria-label="Back to library">
            <IconArrowLeft />
          </Link>
        </Button>
        <AppIcon className="size-7" />
        <h1 className="text-sm font-semibold">Design system</h1>
        <span className="text-muted-foreground hidden text-sm sm:inline">shadcn/ui · Tabler icons · Funnel Sans</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-[180px_1fr] md:px-6">
        <nav className="hidden md:block">
          <ul className="sticky top-20 grid gap-1 text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-muted-foreground hover:text-foreground block rounded-md px-2 py-1">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="grid min-w-0 gap-6">
          <Section id="brand" title="Brand" description="The paint-bucket mark, always one colour: white on violet, all black or all white. The app icon puts it on a violet tile.">
            <div className="flex flex-wrap items-center gap-8">
              <Logo className="text-3xl" />
              <span className="rounded-lg border bg-white p-3">
                <Logo variant="black" className="text-3xl" />
              </span>
              <span className="rounded-lg bg-[#111111] p-3">
                <Logo variant="white" className="text-3xl" />
              </span>
              <AppIcon className="size-12" />
              <AppIcon />
              <AppIcon className="size-4" />
            </div>
          </Section>

          <Section id="color" title="Color" description="White and faintly violet greys with green-black ink in light, neutral greys in dark. Violet (#6D4AFF) is the primary and marks where you are; lime highlights. In globals.css. Switch theme to see dark.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {COLORS.map((c) => (
                <div key={c} className="grid gap-1.5">
                  <div className="h-12 rounded-md border" style={{ background: `var(--${c})` }} />
                  <code className="text-muted-foreground text-xs">--{c}</code>
                </div>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <Grades mode="light" />
              <Grades mode="dark" />
            </div>
          </Section>

          <Section id="type" title="Typography" description="Funnel Display for page titles and section headings (font-display), Funnel Sans for text, Geist Mono for counts and codes.">
            <div className="grid gap-3">
              <p className="font-display text-3xl font-semibold tracking-tight">Your art, all in one bucket</p>
              <p className="font-display text-xl font-semibold tracking-tight">Section heading</p>
              <p className="text-sm font-medium">Label and control text</p>
              <p className="text-sm">Body copy reads at 14px with comfortable line height.</p>
              <p className="text-muted-foreground text-sm">Muted supporting text for descriptions.</p>
              <p className="text-muted-foreground text-xs tabular-nums">4000 × 3000 · 18.4 MB</p>
              <code className="font-mono text-xs">f.channel=web&amp;tag=brand</code>
            </div>
          </Section>

          <Section id="icons" title="Icons" description="@tabler/icons-react, 24px grid, 2px stroke, sized by the parent.">
            <div className="flex flex-wrap gap-2">
              {ICONS.map((I) => (
                <Tooltip key={I.displayName}>
                  <TooltipTrigger asChild>
                    <span className="flex size-10 items-center justify-center rounded-md border">
                      <I className="size-5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{I.displayName}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </Section>

          <Section id="buttons" title="Buttons">
            <div className="flex flex-wrap items-center gap-2">
              <Button>
                <IconUpload /> Upload
              </Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="link">Link</Button>
              <Button variant="destructive">
                <IconTrash /> Delete
              </Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="xs">Extra small</Button>
              <Button size="sm">Small</Button>
              <Button>Default</Button>
              <Button size="lg">Large</Button>
              <Button size="icon-sm" variant="outline" aria-label="Add">
                <IconPlus />
              </Button>
              <Button size="icon" variant="outline" aria-label="Add">
                <IconPlus />
              </Button>
            </div>
          </Section>

          <Section id="badges" title="Badges">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="success">Approved</Badge>
              <Badge variant="warning">Expires soon</Badge>
              <Badge variant="secondary" className="font-mono">
                PSD
              </Badge>
            </div>
          </Section>

          <Section
            id="states"
            title="States"
            description="One way to say working, copied, saved and undone. Buttons go pending in place; copy confirms where you clicked; writes report Saving, Saved or Not saved; a soft delete offers Undo for 8s and Cmd+Z."
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button pending={pending} onClick={() => (setPending(true), setTimeout(() => setPending(false), 1500))}>
                <IconUpload /> Upload
              </Button>
              <Button variant="outline" pending>
                Saving
              </Button>
              <Button variant="destructive" pending>
                <IconTrash /> Delete
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="bg-muted flex items-center gap-2 rounded-md py-1.5 pr-1 pl-3">
                <code className="font-mono text-xs">#6d4aff</code>
                <CopyButton text="#6d4aff" label="Copy hex" />
              </div>
              <CopyButton
                text={() => new Promise((r) => setTimeout(() => r(`${location.origin}/a/sample/w_800,f_webp`), 600))}
                label="Copy a signed link"
                size="icon-sm"
                variant="outline"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Confirm
                title="Delete Spring 2026?"
                says="Its assets stay in the library."
                action="Delete"
                run={() => new Promise((r) => setTimeout(() => r(true), 800))}
              >
                <Button variant="outline">Confirm</Button>
              </Confirm>
              <Confirm
                title="Delete Spring 2026?"
                says="This one fails, so the dialog stays open to retry."
                action="Delete"
                run={() => new Promise((r) => setTimeout(() => (toast.error("Something went wrong", { duration: 10_000 }), r(null)), 800))}
              >
                <Button variant="outline">Confirm, failing</Button>
              </Confirm>
              <Button
                variant="outline"
                onClick={() => undoable("Deleted spring-hero.psd", { undo: () => new Promise((r) => setTimeout(r, 300)) })}
              >
                Undo toast
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="outline" onClick={() => track(new Promise((r) => setTimeout(() => r({}), 800)))}>
                Save
              </Button>
              <Button variant="outline" onClick={() => track(new Promise((r) => setTimeout(() => r(null), 800)))}>
                Save, failing
              </Button>
              <SaveStatus fallback="Edited 2 minutes ago" />
            </div>
          </Section>

          <Section id="keys" title="Keys" description="Every frequent action has a key, shown in its tooltip and its menu. mod is ⌘ on a Mac, Ctrl elsewhere.">
            <div className="flex flex-wrap items-center gap-3">
              <Kbd keys={["mod", "K"]} />
              <Kbd keys={["mod", "B"]} />
              <Kbd keys={["mod", "Z"]} />
              <Kbd keys={["?"]} />
              <Kbd keys={["Esc"]} />
              <IconButton label="Search" shortcut={["mod", "K"]}>
                <IconSearch />
              </IconButton>
            </div>
          </Section>

          <Section id="focus" title="Focus" description="Tab through: every control shows the same ring, only for the keyboard.">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Button</Button>
              <Button variant="outline">Outline</Button>
              <Input aria-label="Focus example" placeholder="Input" className="w-40" />
              <Checkbox aria-label="Focus example" />
              <Switch aria-label="Focus example" />
              <a href="#focus" className="text-sm underline underline-offset-4">
                Link
              </a>
              <IconButton label="Edit" variant="ghost">
                <IconPencil />
              </IconButton>
            </div>
          </Section>

          <Section id="inputs" title="Inputs" description="Every custom field type maps to one of these.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Text" htmlFor="ds-text" hint="Hints sit under the control.">
                <Input id="ds-text" placeholder="Spring campaign" />
              </Field>
              <Field label="Number" htmlFor="ds-number">
                <Input id="ds-number" type="number" placeholder="1200" />
              </Field>
              <Field label="Date" htmlFor="ds-date">
                <Input id="ds-date" type="date" />
              </Field>
              <Field label="Select" htmlFor="ds-select">
                <Select defaultValue="text">
                  <SelectTrigger id="ds-select" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Description" htmlFor="ds-textarea">
                  <Textarea id="ds-textarea" placeholder="What is this, and where may it be used?" />
                </Field>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2">
                <Label htmlFor="ds-switch">Approved</Label>
                <Switch id="ds-switch" defaultChecked />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="ds-check" defaultChecked />
                <Label htmlFor="ds-check" className="font-normal">
                  Required at upload
                </Label>
              </div>
            </div>
          </Section>

          <Section
            id="autocomplete"
            title="Autocomplete"
            description="Type to narrow. Tags accept new values with Enter or a comma; Backspace removes the last chip."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Pick list" htmlFor="ds-combo">
                <Combobox id="ds-combo" options={["web", "print", "social", "ooh"].map((value) => ({ value }))} placeholder="Choose a channel" />
              </Field>
              <Field label="Collections" htmlFor="ds-multi">
                <MultiCombobox
                  id="ds-multi"
                  options={[
                    { value: "1", label: "Spring 2026", hint: 42 },
                    { value: "2", label: "Logos", hint: 8 },
                    { value: "3", label: "Social", hint: 120 },
                  ]}
                  defaultValue={["1"]}
                  placeholder="Add to a collection"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Tags" htmlFor="ds-tags">
                  <MultiCombobox id="ds-tags" options={TAGS} defaultValue={["brand", "spring"]} placeholder="Add tags" creatable />
                </Field>
              </div>
            </div>
          </Section>

          <Section id="filters" title="Filters" description="Faceted filters with live counts, as in the library toolbar.">
            <div className="flex flex-wrap items-center gap-2">
              <FacetFilter label="Tags" counts={TAGS.map((t) => ({ value: t.value, count: t.hint }))} selected={facet} onChange={setFacet} />
              <FacetFilter
                label="Approved"
                counts={[
                  { value: "true", count: 12 },
                  { value: "false", count: 3 },
                ]}
                selected={[]}
                onChange={() => {}}
                format={(v) => (v === "true" ? "Yes" : "No")}
              />
              <Badge variant="secondary" className="h-8">
                budget ≥ 100
              </Badge>
            </div>
          </Section>

          <Section id="overlays" title="Overlays">
            <div className="flex flex-wrap items-center gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Dialog</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>New collection</DialogTitle>
                    <DialogDescription>Group assets without moving them.</DialogDescription>
                  </DialogHeader>
                  <Field label="Name" htmlFor="ds-dialog-name">
                    <Input id="ds-dialog-name" placeholder="Spring 2026" />
                  </Field>
                  <DialogFooter>
                    <Button>Create</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline">Alert dialog</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Spring 2026?</AlertDialogTitle>
                    <AlertDialogDescription>Its assets stay in the library.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">Sheet</Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Sheet</SheetTitle>
                    <SheetDescription>Side panels for secondary tasks.</SheetDescription>
                  </SheetHeader>
                </SheetContent>
              </Sheet>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">Popover</Button>
                </PopoverTrigger>
                <PopoverContent className="w-72">
                  <div className="flex gap-2">
                    <Input placeholder="Name this search" className="h-8" />
                    <Button size="sm">Save</Button>
                  </div>
                </PopoverContent>
              </Popover>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    Menu <IconDots />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem>
                    <IconPencil /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <IconDownload /> Download
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive">
                    <IconTrash /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">Tooltip</Button>
                </TooltipTrigger>
                <TooltipContent>Stored as usage_rights</TooltipContent>
              </Tooltip>
            </div>
            <Separator />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => toast.success("Saved")}>
                Success toast
              </Button>
              <Button variant="outline" onClick={() => toast.error("Couldn't save")}>
                Error toast
              </Button>
              <Button variant="outline" onClick={() => toast.warning("Saved, but a collection change didn't go through")}>
                Warning toast
              </Button>
            </div>
          </Section>

          <Section id="feedback" title="Feedback" description="Empty states say what's missing and offer the next step; skeletons hold the layout while data loads.">
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconSearch />
                </EmptyMedia>
                <EmptyTitle>No matches</EmptyTitle>
                <EmptyDescription>Nothing matches &ldquo;fox&rdquo; in Spring 2026. Try fewer words or drop a filter.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row justify-center">
                <Button variant="outline">Clear filters</Button>
                <Button variant="ghost">Search all files</Button>
              </EmptyContent>
            </Empty>
            <GridSkeleton count={4} />
            <div className="grid gap-4">
              <Progress value={64} aria-label="Example progress" />
              <div className="flex items-center gap-4">
                <Skeleton className="size-16 rounded-xl" />
                <div className="grid flex-1 gap-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            </div>
          </Section>

          <Section id="navigation" title="Navigation">
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="fields">Fields</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="text-muted-foreground text-sm">
                Title, description, creator.
              </TabsContent>
              <TabsContent value="fields" className="text-muted-foreground text-sm">
                Custom fields.
              </TabsContent>
              <TabsContent value="history" className="text-muted-foreground text-sm">
                Changes over time.
              </TabsContent>
            </Tabs>
            <ToggleGroup type="single" defaultValue="grid" variant="outline">
              <ToggleGroupItem value="grid" aria-label="Grid">
                <IconLayoutGrid />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List">
                <IconList />
              </ToggleGroupItem>
            </ToggleGroup>
          </Section>

          <Section id="cards" title="Asset card" description="The library tile. The art is contained, never cropped. Cmd, Ctrl or Shift-click selects. Suggested assets and tags are flagged for review. A title, when there is one, reads before the filename.">
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
              <AssetCard asset={SAMPLE} />
              <AssetCard asset={{ ...SAMPLE, id: "b", filename: "logo.svg", tags: [], width: null, height: null, size: 4200 }} />
              <AssetCard asset={{ ...SAMPLE, id: "c", filename: "selected.png" }} selected selecting onPick={() => {}} />
              <AssetCard asset={{ ...SAMPLE, id: "d", filename: "agent-upload.jpg", status: "proposed" }} />
              <AssetCard asset={{ ...SAMPLE, id: "e", filename: "suggested.jpg", proposedTags: ["sunset", "hero"] }} />
            </div>
          </Section>
        </main>
      </div>
    </div>
  );
}
