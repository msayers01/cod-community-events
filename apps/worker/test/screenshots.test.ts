import { describe, expect, it } from "vitest";
import { isAllowedScreenshotUrl } from "../src/screenshots.js";

describe("screenshot links the worker will fetch", () => {
  it("allows https links on the image hosts we trust", () => {
    expect(isAllowedScreenshotUrl("https://i.imgur.com/abc.png")).toBe(true);
    expect(isAllowedScreenshotUrl("https://cdn.discordapp.com/attachments/1/2/board.png")).toBe(
      true,
    );
  });
  it("never fetches arbitrary, internal or credentialed URLs on a user's behalf", () => {
    for (const url of [
      "http://i.imgur.com/abc.png", // not https
      "https://evil.example.com/board.png",
      "https://i.imgur.com.evil.example.com/board.png",
      "https://169.254.169.254/latest/meta-data/",
      "https://localhost:3000/api/secret",
      "https://user:pw@i.imgur.com/abc.png",
      "file:///etc/passwd",
      "not a url",
    ])
      expect(isAllowedScreenshotUrl(url), url).toBe(false);
  });
});
