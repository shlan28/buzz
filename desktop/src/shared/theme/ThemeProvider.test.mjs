import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ACCENT,
  NEUTRAL_ACCENT,
  isBuzzTheme,
  resolveStoredAccent,
} from "./ThemeProvider.tsx";

test("fresh profiles default to the neutral accent", () => {
  assert.equal(DEFAULT_ACCENT, NEUTRAL_ACCENT);
  assert.equal(resolveStoredAccent(null), NEUTRAL_ACCENT);
});

test("saved accent colors are preserved for every theme", () => {
  assert.equal(resolveStoredAccent("#a855f7"), "#a855f7");
  assert.equal(resolveStoredAccent("#ec4899"), "#ec4899");
  assert.equal(resolveStoredAccent(NEUTRAL_ACCENT), NEUTRAL_ACCENT);
});

test("Buzz theme detection remains available for branded shell behavior", () => {
  assert.equal(isBuzzTheme("buzz"), true);
  assert.equal(isBuzzTheme("buzz-dark"), true);
  assert.equal(isBuzzTheme("catppuccin-latte"), false);
});
