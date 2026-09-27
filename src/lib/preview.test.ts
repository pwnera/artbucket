import assert from "node:assert/strict";
import { test } from "node:test";
import { embedUrl, parseLink } from "./preview.ts";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

test("links to Figma and Google files are kept as links, with an embed", () => {
  assert.deepEqual(parseLink("https://www.figma.com/design/abc123/Brand-kit?node-id=1-2"), {
    service: "Figma",
    embed: "https://www.figma.com/embed?embed_host=artbucket&url=https%3A%2F%2Fwww.figma.com%2Fdesign%2Fabc123%2FBrand-kit%3Fnode-id%3D1-2",
  });
  assert.deepEqual(parseLink(`https://docs.google.com/presentation/d/${ID}/edit#slide=id.p`), {
    service: "Slides",
    embed: `https://docs.google.com/presentation/d/${ID}/preview`,
    drive: ID,
  });
  assert.equal(parseLink(`https://docs.google.com/document/d/${ID}/edit?usp=sharing`)?.service, "Docs");
  assert.equal(parseLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)?.service, "Sheets");
  assert.equal(parseLink(`https://drive.google.com/file/d/${ID}/view`)?.embed, `https://drive.google.com/file/d/${ID}/preview`);
});

test("anything else is fetched like any URL", () => {
  for (const url of [
    "https://example.com/logo.png",
    `http://docs.google.com/document/d/${ID}/edit`,
    `https://docs.google.com.evil.test/document/d/${ID}/edit`,
    "https://www.figma.com/community/file/123",
    "https://docs.google.com/document/u/0/",
    "not a url",
  ])
    assert.equal(parseLink(url), null, url);
});

test("only an embed parseLink could have built is shown", () => {
  assert.equal(embedUrl({ mime: "text/uri-list", probe: { embed: "https://evil.test/x" } }), null);
  const embed = parseLink(`https://docs.google.com/document/d/${ID}/edit`)!.embed;
  assert.equal(embedUrl({ mime: "text/uri-list", probe: { embed } }), embed);
});
