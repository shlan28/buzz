import assert from "node:assert/strict";
import test from "node:test";

import { NEUTRAL_ACCENT, isBuzzTheme } from "./ThemeProvider.tsx";

test("Buzz themes keep the neutral branded accent behavior", () => {
  assert.equal(NEUTRAL_ACCENT, "neutral");
  assert.equal(isBuzzTheme("buzz"), true);
  assert.equal(isBuzzTheme("buzz-dark"), true);
  assert.equal(isBuzzTheme("catppuccin-latte"), false);
});
