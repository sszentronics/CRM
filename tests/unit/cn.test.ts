import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("keeps a text colour next to one of our text sizes", () => {
    expect(cn("text-white", "text-label")).toBe("text-white text-label");
    expect(cn("text-body", "text-tl-danger")).toBe("text-body text-tl-danger");
  });

  it("still lets a later size or colour win", () => {
    expect(cn("text-body", "text-label")).toBe("text-label");
    expect(cn("text-white", "text-tl-text")).toBe("text-tl-text");
  });
});
