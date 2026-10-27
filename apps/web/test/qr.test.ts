import { describe, expect, it } from "vitest";
import { qrToDataUrl } from "@/lib/qr";

describe("qrToDataUrl", () => {
  it("deja intacta una URL de datos", () => {
    expect(qrToDataUrl("data:image/svg+xml;utf-8,<svg/>")).toBe("data:image/svg+xml;utf-8,<svg/>");
  });
  it("convierte un SVG en URL de datos escapada", () => {
    expect(qrToDataUrl("<svg a='1'/>")).toBe(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent("<svg a='1'/>")}`,
    );
  });
});
