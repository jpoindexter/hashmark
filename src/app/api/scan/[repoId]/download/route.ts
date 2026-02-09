import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimitResponse } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

// 30 downloads per user per 10 minutes
const DOWNLOAD_LIMIT = { max: 30, windowSeconds: 600 };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ repoId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit by user
  const limited = rateLimitResponse(session.user.id, "download", DOWNLOAD_LIMIT);
  if (limited) return limited;

  const { repoId } = await params;

  // Verify ownership
  const repo = await db.repository.findUnique({
    where: { id: repoId, userId: session.user.id },
    select: { fullName: true },
  });
  if (!repo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get files from latest completed scan
  const latestScan = await db.scan.findFirst({
    where: { repositoryId: repoId, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    include: { generatedFiles: true },
  });

  if (!latestScan || latestScan.generatedFiles.length === 0) {
    return NextResponse.json(
      { error: "No generated files found" },
      { status: 404 }
    );
  }

  // Build ZIP using the Web Compression API (no external deps)
  // ZIP format: local file headers + file data + central directory + end record
  const files = latestScan.generatedFiles.map((f) => ({
    name: f.fileName,
    data: new TextEncoder().encode(f.content),
  }));

  const zipBuffer = buildZip(files);
  const safeRepoName = repo.fullName.replace(/\//g, "-");

  return new Response(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="hashmark-${safeRepoName}.zip"`,
      "Content-Length": String(zipBuffer.byteLength),
    },
  });
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * Build a minimal ZIP file in memory without external dependencies.
 * Supports STORE method (no compression) — files are small text, so
 * compression overhead isn't worth the dependency.
 */
function buildZip(entries: ZipEntry[]): ArrayBuffer {
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = new TextEncoder().encode(entry.name);
    const crc = crc32(entry.data);

    // Local file header (30 bytes + filename + file data)
    const localHeader = new ArrayBuffer(30 + nameBytes.length);
    const localView = new DataView(localHeader);
    localView.setUint32(0, 0x04034b50, true); // Local file header signature
    localView.setUint16(4, 20, true); // Version needed (2.0)
    localView.setUint16(6, 0, true); // General purpose bit flag
    localView.setUint16(8, 0, true); // Compression method (STORE)
    localView.setUint16(10, 0, true); // Last mod file time
    localView.setUint16(12, 0, true); // Last mod file date
    localView.setUint32(14, crc, true); // CRC-32
    localView.setUint32(18, entry.data.length, true); // Compressed size
    localView.setUint32(22, entry.data.length, true); // Uncompressed size
    localView.setUint16(26, nameBytes.length, true); // Filename length
    localView.setUint16(28, 0, true); // Extra field length
    new Uint8Array(localHeader).set(nameBytes, 30);

    localHeaders.push(new Uint8Array(localHeader));
    localHeaders.push(entry.data);

    // Central directory header (46 bytes + filename)
    const centralHeader = new ArrayBuffer(46 + nameBytes.length);
    const centralView = new DataView(centralHeader);
    centralView.setUint32(0, 0x02014b50, true); // Central directory signature
    centralView.setUint16(4, 20, true); // Version made by
    centralView.setUint16(6, 20, true); // Version needed
    centralView.setUint16(8, 0, true); // General purpose bit flag
    centralView.setUint16(10, 0, true); // Compression method (STORE)
    centralView.setUint16(12, 0, true); // Last mod file time
    centralView.setUint16(14, 0, true); // Last mod file date
    centralView.setUint32(16, crc, true); // CRC-32
    centralView.setUint32(20, entry.data.length, true); // Compressed size
    centralView.setUint32(24, entry.data.length, true); // Uncompressed size
    centralView.setUint16(28, nameBytes.length, true); // Filename length
    centralView.setUint16(30, 0, true); // Extra field length
    centralView.setUint16(32, 0, true); // File comment length
    centralView.setUint16(34, 0, true); // Disk number start
    centralView.setUint16(36, 0, true); // Internal file attributes
    centralView.setUint32(38, 0, true); // External file attributes
    centralView.setUint32(42, offset, true); // Relative offset of local header
    new Uint8Array(centralHeader).set(nameBytes, 46);

    centralHeaders.push(new Uint8Array(centralHeader));

    offset += 30 + nameBytes.length + entry.data.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const h of centralHeaders) centralDirSize += h.length;

  // End of central directory record (22 bytes)
  const endRecord = new ArrayBuffer(22);
  const endView = new DataView(endRecord);
  endView.setUint32(0, 0x06054b50, true); // EOCD signature
  endView.setUint16(4, 0, true); // Disk number
  endView.setUint16(6, 0, true); // Disk with central dir
  endView.setUint16(8, entries.length, true); // Entries on this disk
  endView.setUint16(10, entries.length, true); // Total entries
  endView.setUint32(12, centralDirSize, true); // Central dir size
  endView.setUint32(16, centralDirOffset, true); // Central dir offset
  endView.setUint16(20, 0, true); // Comment length

  // Concatenate everything
  const totalSize =
    offset + centralDirSize + 22;
  const result = new Uint8Array(totalSize);
  let pos = 0;

  for (const chunk of localHeaders) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of centralHeaders) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  result.set(new Uint8Array(endRecord), pos);

  return result.buffer;
}

/** CRC-32 with standard polynomial (used by ZIP format) */
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
