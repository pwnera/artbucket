import preview from "#.storybook/preview";
import { expect } from "storybook/test";
import { Waiting } from "@/components/waiting";

const meta = preview.meta({
  title: "App/Patterns/Waiting",
  component: Waiting,
  args: { what: "Waiting for DNS", stopped: false, className: "text-sm" },
  argTypes: { checkedAt: { control: false } },
});

/** Before the first check: the pulse and what it waits for. */
export const Playground = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Waiting for DNS")).toBeInTheDocument();
  },
});

/** It checked a moment ago, and says so, counting up each second. Relative to now, read when it renders. */
export const Checked = meta.story({
  render: (args) => <Waiting {...args} checkedAt={Date.now() - 12_000} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/checked \d+s ago/)).toBeInTheDocument();
  },
});

/** A while ago: in minutes. */
export const MinutesAgo = meta.story({
  render: (args) => <Waiting {...args} checkedAt={Date.now() - 150_000} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/checked 2 min ago/)).toBeInTheDocument();
  },
});

/** Stopped: a still dot, so the wait never seems dead. */
export const Stopped = meta.story({
  args: { stopped: true },
  render: (args) => <Waiting {...args} checkedAt={Date.now() - 30_000} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/stopped checking/)).toBeInTheDocument();
  },
});

/** An agent's first call, as Connections waits for it. */
export const FirstCall = meta.story({ args: { what: "Waiting for its first call" } });
