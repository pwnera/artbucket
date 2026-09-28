import assert from "node:assert/strict";
import { test } from "node:test";
import { clearSpace, cobrand, lengths, markSize, measure, meetsMin, onPage, PAGE, place, positionName, spacing, toPx } from "./diagram.ts";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} is not ${b}`);

test("the mark is MARK high, as wide as its picture", () => {
  assert.deepEqual(markSize(360, 96), { width: 375, height: 100 });
  assert.deepEqual(markSize(null, null), { width: 100, height: 100 });
});

test("clear space is x times the mark's height on every side", () => {
  const mark = markSize(360, 96);
  const pad = spacing({ value: 0.5, unit: "x", of: "the mark's height" }, mark)!;
  assert.equal(pad, 50);
  assert.deepEqual(clearSpace(mark, pad), { zone: { x: 0, y: 0, width: 475, height: 200 }, mark: { x: 50, y: 50, width: 375, height: 100 } });
  // A percent of the mark, and of its width when `of` says so.
  assert.equal(spacing({ value: 25, unit: "%" }, mark), 25);
  assert.equal(spacing({ value: 0.1, unit: "x", of: "the mark's width" }, mark), 37.5);
  // A length has nothing to be measured against without a page.
  assert.equal(spacing({ value: 10, unit: "px" }, mark), null);
  assert.equal(spacing({ value: 2, unit: "em" }, mark, PAGE), null);
});

test("a minimum size in px, mm and pt", () => {
  assert.equal(toPx(24, "px"), 24);
  close(toPx(1, "in")!, 96);
  const mm = lengths(8, "mm")!;
  close(mm.px, 30.236220472);
  close(mm.mm, 8);
  close(mm.pt, 22.677165354);
  const px = lengths(24, "px")!;
  close(px.mm, 6.35);
  close(px.pt, 18);
  assert.equal(lengths(0.5, "x"), null);
  assert.equal(toPx(3, undefined), null);
});

test("the size checker compares across units", () => {
  assert.equal(meetsMin({ value: 24, unit: "px" }, { value: 24, unit: "px" }), true);
  assert.equal(meetsMin({ value: 23, unit: "px" }, { value: 24, unit: "px" }), false);
  assert.equal(meetsMin({ value: 8, unit: "mm" }, { value: 22.677165354, unit: "pt" }), true);
  assert.equal(meetsMin({ value: 7.9, unit: "mm" }, { value: 8, unit: "mm" }), false);
  assert.equal(meetsMin({ value: 1, unit: "in" }, { value: 25.4, unit: "mm" }), true);
  assert.equal(meetsMin({ value: 50, unit: "%" }, { value: 8, unit: "mm" }), null);
});

test("placement: in from the edges by the margin, at each position", () => {
  // 5% of an A4's shorter side, a length in mm as is, x of the mark.
  assert.equal(spacing({ value: 5, unit: "%", of: "the page's shorter side" }, markSize(), PAGE), 10.5);
  assert.equal(spacing({ value: 12, unit: "mm" }, markSize(), PAGE), 12);
  assert.equal(spacing({ value: 5, unit: "%", of: "the mark's height" }, markSize(), PAGE), 5);
  const mark = onPage(markSize(360, 96));
  close(mark.width, 52.5);
  const m = 10;
  assert.deepEqual(place(PAGE, mark, "tl", m), { x: 10, y: 10, ...mark });
  const br = place(PAGE, mark, "br", m);
  close(br.x + br.width, PAGE.width - m);
  close(br.y + br.height, PAGE.height - m);
  const mc = place(PAGE, mark, "mc", m);
  close(mc.x + mc.width / 2, PAGE.width / 2);
  close(mc.y + mc.height / 2, PAGE.height / 2);
  // A square mark is held to a twelfth of the page's height.
  close(onPage(markSize()).height, 297 / 12);
  assert.equal(positionName("bl"), "bottom left");
  assert.equal(positionName("mc"), "center");
});

test("co-brand: same height, the gap on each side of the separator", () => {
  const mark = markSize(360, 96);
  const partner = { width: 200, height: 50 };
  const line = cobrand(mark, partner, 50, "line");
  assert.deepEqual(line.partner, { x: 475, y: 0, width: 400, height: 100 });
  assert.deepEqual(line.separator, { x: 425, y: 0, width: 0, height: 100 });
  assert.deepEqual(line.size, { width: 875, height: 100 });
  const x = cobrand(mark, partner, 50, "x");
  close(x.separator!.width, 100 / 3);
  close(x.partner.x, 475 + 100 / 3);
  const none = cobrand(mark, partner, 50, "none");
  assert.equal(none.separator, null);
  assert.equal(none.partner.x, 425);
});

test("values read with their units", () => {
  assert.equal(measure(0.5, "x"), "0.5x");
  assert.equal(measure(5, "%"), "5%");
  assert.equal(measure(22.677165, "pt"), "22.68 pt");
  assert.equal(measure(3, undefined), "3");
});
