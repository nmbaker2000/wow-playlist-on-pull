import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function readRendererHtml(): string {
  return readFileSync(join(__dirname, "..", "renderer", "index.html"), "utf8");
}

test("places YouTube Premium account controls before OAuth credential setup", () => {
  const html = readRendererHtml();
  const premiumAnchor = html.indexOf('data-provider-accounts="youtube"');

  assert.notEqual(premiumAnchor, -1);
  for (const marker of ['id="oauthHelp"', 'id="youtubeOAuthClientId"', 'id="youtubeOAuthClientSecret"']) {
    const oauthAnchor = html.indexOf(marker);
    assert.notEqual(oauthAnchor, -1);
    assert.ok(premiumAnchor < oauthAnchor, `${marker} should appear after YouTube Premium account controls`);
  }
});

test("explains why YouTube OAuth client credentials are needed", () => {
  const html = readRendererHtml();

  assert.match(
    html,
    /Client ID and Client Secret let the app ask Google for permission to list your YouTube playlists/
  );
  assert.match(html, /Only use them if you want to choose playlists from your YouTube account/);
});
