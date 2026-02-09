import { describe, it, expect } from "vitest";
import { buildZip, crc32 } from "../zip";

describe("crc32", () => {
  it("computes correct CRC for known input", () => {
    // "123456789" has a well-known CRC-32 of 0xCBF43926
    const data = new TextEncoder().encode("123456789");
    expect(crc32(data)).toBe(0xcbf43926);
  });

  it("returns 0x00000000 for empty input", () => {
    expect(crc32(new Uint8Array(0))).toBe(0x00000000);
  });
});

describe("buildZip", () => {
  it("produces valid ZIP structure for single file", () => {
    const data = new TextEncoder().encode("hello world");
    const zip = buildZip([{ name: "test.txt", data }]);
    const bytes = new Uint8Array(zip);

    // Local file header signature
    const view = new DataView(zip);
    expect(view.getUint32(0, true)).toBe(0x04034b50);

    // EOCD signature at the end
    const eocdOffset = bytes.length - 22;
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);

    // EOCD reports 1 entry
    expect(view.getUint16(eocdOffset + 8, true)).toBe(1);
  });

  it("handles multiple files", () => {
    const files = [
      { name: "a.txt", data: new TextEncoder().encode("file a") },
      { name: "b.txt", data: new TextEncoder().encode("file b") },
      { name: "c.md", data: new TextEncoder().encode("# heading") },
    ];
    const zip = buildZip(files);
    const view = new DataView(zip);
    const eocdOffset = new Uint8Array(zip).length - 22;

    // EOCD reports 3 entries
    expect(view.getUint16(eocdOffset + 8, true)).toBe(3);
  });

  it("handles empty entries list", () => {
    const zip = buildZip([]);
    const view = new DataView(zip);

    // Should just be EOCD (22 bytes)
    expect(new Uint8Array(zip).length).toBe(22);
    expect(view.getUint32(0, true)).toBe(0x06054b50);
    expect(view.getUint16(8, true)).toBe(0); // 0 entries
  });

  it("stores file content uncompressed", () => {
    const content = "test content 123";
    const data = new TextEncoder().encode(content);
    const zip = buildZip([{ name: "t.txt", data }]);
    const bytes = new Uint8Array(zip);

    // The file data should appear verbatim after the local header
    const nameLen = "t.txt".length;
    const dataStart = 30 + nameLen;
    const stored = new TextDecoder().decode(
      bytes.slice(dataStart, dataStart + data.length)
    );
    expect(stored).toBe(content);
  });
});
