import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { publicOrigin } from "@/lib/http/origin";

function req(url: string, headers: Record<string, string>) {
  return new NextRequest(url, { headers });
}

describe("publicOrigin", () => {
  it("uses the host the visitor typed, not the address the server listens on", () => {
    const r = req("http://localhost:3200/auth/signout", { host: "192.168.18.13:3200" });
    expect(publicOrigin(r)).toBe("http://192.168.18.13:3200");
  });

  it("prefers the proxy's forwarded host and protocol", () => {
    const r = req("http://localhost:3000/auth/signout", {
      host: "localhost:3000",
      "x-forwarded-host": "crm.example.com",
      "x-forwarded-proto": "https",
    });
    expect(publicOrigin(r)).toBe("https://crm.example.com");
  });

  it("falls back to the request origin when the host header looks wrong", () => {
    const r = req("http://localhost:3200/x", { host: "evil.com/\@x" });
    expect(publicOrigin(r)).toBe("http://localhost:3200");
  });
});
