import { expect, test } from "@playwright/test";
import { buildUnsignedChannelMessage } from "../../src/shared/api/messagePublish";

test("builds a channel-scoped message and deduplicates DM recipients", () => {
  const recipient = "22".repeat(32);
  expect(
    buildUnsignedChannelMessage({
      channelId: "11111111-1111-4111-8111-111111111111",
      content: " hello Agent ",
      mentionPubkeys: [recipient, recipient],
      createdAt: 100,
      clientId: "web-test",
    }),
  ).toEqual({
    kind: 9,
    created_at: 100,
    content: "hello Agent",
    tags: [
      ["h", "11111111-1111-4111-8111-111111111111"],
      ["p", recipient],
      ["client", "web-test"],
    ],
  });
});

test("rejects unscoped, empty, and malformed message requests", () => {
  expect(() =>
    buildUnsignedChannelMessage({ channelId: "not-a-channel", content: "hi" }),
  ).toThrow("invalid channel id");
  expect(() =>
    buildUnsignedChannelMessage({
      channelId: "11111111-1111-4111-8111-111111111111",
      content: "   ",
    }),
  ).toThrow("cannot be empty");
  expect(() =>
    buildUnsignedChannelMessage({
      channelId: "11111111-1111-4111-8111-111111111111",
      content: "hi",
      mentionPubkeys: ["bad"],
    }),
  ).toThrow("invalid public key");
});
