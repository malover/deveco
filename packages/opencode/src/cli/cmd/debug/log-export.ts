import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Effect, Layer, Logger, ManagedRuntime, References } from 'effect';
import { NodeFileSystem } from '@effect/platform-node';
import { Global } from '@opencode-ai/core/global';
import { Logging } from '@opencode-ai/core/observability/logging';
import { ensureValidToken } from '@/plugin/deveco';
import { getOrCreateDeviceId, getVersion } from '@/plugin/analytics';
import { createEnvironmentFields } from '@/plugin/analytics/events';
import { runID } from '@opencode-ai/core/observability/shared';

const baseUrl = process.env.DEVECO_CONTENT_CENTER_URL || 'https://cn.devecostudio.huawei.com/codeGenie';
const uploadUrl = '/cli/content/v3/files';
const uploadCompleteUrl = '/cli/content/v3/files/complete';

interface UploadInfo {
  url: string
  method: string
  headers: Record<string, string>
}

interface FileRspInfo {
  index: string
  fileId: string
  uploadInfo: UploadInfo
}

// --- Minimal logging runtime (uses the same fileLogger as Effect business logs) ---

let logRuntime: ManagedRuntime.ManagedRuntime<never, never> | undefined;

function getLogRuntime() {
  if (!logRuntime) {
    const layer = Logger.layer(Logging.loggers(), { mergeWithExisting: false }).pipe(
      Layer.provide(NodeFileSystem.layer),
      Layer.orDie,
      Layer.merge(Layer.succeed(References.MinimumLogLevel, Logging.minimumLogLevel())),
    );
    logRuntime = ManagedRuntime.make(layer);
  }
  return logRuntime;
}

/** Log to deveco.log via Effect's structured logger (same format as business logs). */
export function logInfo(message: string, extra?: Record<string, unknown>): void {
  try {
    getLogRuntime().runFork(Effect.logInfo(message, extra));
  } catch {}
}

export function logWarn(message: string, extra?: Record<string, unknown>): void {
  try {
    getLogRuntime().runFork(Effect.logWarning(message, extra));
  } catch {}
}

export function logError(message: string, extra?: Record<string, unknown>): void {
  try {
    getLogRuntime().runFork(Effect.logError(message, extra));
  } catch {}
}

/** List all *.log files available for collection. */
export function listLogFiles(): { path: string; label: string; group: string }[] {
  const logDir = Global.Path.log;
  const dirs = [
    { dir: logDir, group: 'deveco' },
    { dir: path.join(logDir, 'deveco-mcp', 'codegenie-mcp-server', 'logs'), group: 'mcp' },
  ];
  const results: { path: string; label: string; group: string }[] = [];
  for (const { dir, group } of dirs) {
    results.push(...collectLogFiles(dir, group));
  }
  return results;
}

function collectLogFiles(dir: string, group: string): { path: string; label: string; group: string }[] {
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return [];
    }
    return fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.log'))
      .filter((file) => fs.statSync(path.join(dir, file)).isFile())
      .map((file) => ({ path: path.join(dir, file), label: file, group }));
  } catch {}
  return [];
}

/** Pack given file paths into a zip archive. */
export function packLogs(paths: string[]): Buffer | undefined {
  const logDir = Global.Path.log;
  const entries: Array<{ name: string; absPath: string }> = [];

  if (paths.length > 0) {
    for (const p of paths) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const rel = path.relative(logDir, p) || path.basename(p);
        entries.push({ name: rel, absPath: p });
      }
    }
  }

  if (entries.length === 0) {
    return undefined;
  }

  return zipFiles(entries.map((e) => ({ name: e.name, data: fs.readFileSync(e.absPath) })));
}

/**
 * Three-step upload to Content Center (pre-shared key auth):
 * 1. POST /content-manager/v3/files  — get upload info
 * 2. PUT  {obsUrl}                    — upload file body
 * 3. POST /content-manager/v3/files/complete — confirm
 *
 * Retries up to 3 times (with incremental backoff) on failure.
 * Throws on final failure so callers can handle accordingly.
 */
export async function uploadLogs(archive: Buffer, triggerType: string = '00001', maxRetries = 3): Promise<void> {
  if (archive.length > 50 * 1024 * 1024) {
    throw new Error('archive file size exceeds 50MB');
  }
  const authToken = await ensureValidToken();
  if (!authToken) {
    throw new Error('no auth token');
  }
  const fileSha256 = crypto.createHash('sha256').update(archive).digest('hex');
  const fileName = `deveco-logs-${Date.now()}.zip`;
  const index = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const step1Body = {
    fileInfos: [
      {
        index,
        fileName,
        contentType: 900,
        fileSha256,
        fileSize: archive.length,
        fileAccessRight: 1,
      },
    ],
    useAccelerate: false,
  };
  const step1BodyStr = JSON.stringify(step1Body);
  const commonHeaders = {
    authorization: `Bearer ${authToken}`,
    'Content-Type': 'application/json',
  };
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const fileId = await uploadOnce(archive, step1BodyStr, commonHeaders);
      await uploadLogTracePoint(commonHeaders, true, triggerType, fileId);
      return; // success
    } catch (e) {
      lastError = e;
      logError(`upload attempt ${attempt}/${maxRetries} failed`, { error: String(e) });
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }
  try {
    await uploadLogTracePoint(commonHeaders, false, triggerType);
  } catch {}
  throw lastError;
}

/** Single upload attempt — throws on any step failure. */
export async function uploadOnce(archive: Buffer, step1BodyStr: string, commonHeaders: Record<string, string>): Promise<string> {
  // --- Step 1: Get upload info ---
  const resp1 = await fetchWithTimeout(`${baseUrl}${uploadUrl}`,
    { method: 'POST', headers: commonHeaders, body: step1BodyStr }, 15_000);
  const data1 = (await resp1.json()) as { code?: number; message?: string; data?: { fileRspInfos?: FileRspInfo[] } };
  if (data1.code !== 200) {
    throw new Error(`step1 failed: code=${data1.code} message=${data1.message}`);
  }
  const rsp = data1.data?.fileRspInfos?.[0];
  if (!rsp) {
    throw new Error('step1: no fileRspInfos in response');
  }
  // --- Step 2: Upload file to OBS ---
  const fileId: string = rsp.fileId;
  const uploadInfo: UploadInfo = rsp.uploadInfo;
  const resp2 = await fetchWithTimeout(uploadInfo.url,
    { method: uploadInfo.method || 'PUT', headers: uploadInfo.headers, body: new Uint8Array(archive)}, 15_000);
  if (!resp2.ok) {
    throw new Error(`step2 failed: status=${resp2.status}`);
  }
  // --- Step 3: Confirm completion ---
  const step3Body = {
    fileCompleteInfos: [
      {
        fileId,
        expireDate: 30 * 24 * 60 * 60,
      },
    ],
  };
  const step3BodyStr = JSON.stringify(step3Body);
  const resp3 = await fetchWithTimeout(`${baseUrl}${uploadCompleteUrl}`,
    { method: 'POST', headers: commonHeaders, body: step3BodyStr }, 15_000);
  const data3 = (await resp3.json()) as { code?: number; message?: string };
  if (data3.code === 200) {
    logInfo('logs uploaded success', { fileId });
  } else {
    throw new Error(`step3 failed: code=${data3.code} message=${data3.message}`);
  }
  return fileId;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function uploadLogTracePoint(
  commonHeaders: Record<string, string>,
  isSuccess: boolean,
  triggerType: string,
  fileId?: string,
): Promise<void> {
  try {
    const uid = await getOrCreateDeviceId();
    const version = getVersion();
    const environment = createEnvironmentFields(version);
    const tracePoint = {
      file_id: fileId,
      uid,
      timestamp: Date.now(),
      source_type: 'DevEco-Code',
      source_version: version,
      os_name: environment.os_name,
      os_version: environment.os_version,
      trace_sid: runID,
      event_type: triggerType,
      is_success: isSuccess,
    };
    const payload = {
      action: 'DevEco-Code',
      countryCode: 'CN',
      detail: JSON.stringify(tracePoint),
      osArch: environment.os_arch,
      sid: 10200,
      timestamp: Date.now(),
      uid,
      version,
    };
    const resp = await fetchWithTimeout(
      `${baseUrl}/cli/trace/upload`,
      {
        method: 'POST',
        headers: commonHeaders,
        body: JSON.stringify([payload]),
      },
      10_000,
    );

    if (resp.ok) {
      logInfo('log trace point uploaded successfully', { triggerType, isSuccess });
    } else {
      logWarn('log trace point upload failed', { status: resp.status, triggerType });
    }
  } catch (e) {
    logWarn('failed to upload log trace point', { error: String(e) });
  }
}

/**
 * Build a minimal ZIP archive (no compression — store method).
 * Compatible with all standard unzip tools.
 */
function zipFiles(files: { name: string; data: Buffer }[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const size = file.data.length;

    localParts.push(buildLocalHeader(nameBuf, file.data, crc, size));
    centralParts.push(buildCentralHeader(nameBuf, crc, size, offset));

    offset += 30 + nameBuf.length + size;
  }

  const localBuf = Buffer.concat(localParts);
  const centralBuf = Buffer.concat(centralParts);
  return Buffer.concat([localBuf, centralBuf, buildEocd(centralBuf.length, localBuf.length, files.length)]);
}

function buildLocalHeader(nameBuf: Buffer, data: Buffer, crc: number, size: number): Buffer {
  const h = Buffer.alloc(30);
  h.writeUInt32LE(0x04034b50, 0);
  h.writeUInt16LE(20, 4); // version needed
  h.writeUInt16LE(0, 6); // flags
  h.writeUInt16LE(0, 8); // method: 0 = store
  h.writeUInt16LE(0, 10); // mod time
  h.writeUInt16LE(0, 12);// mod date
  h.writeUInt32LE(crc, 14); // crc32
  h.writeUInt32LE(size, 18); // compressed size
  h.writeUInt32LE(size, 22); // uncompressed size
  h.writeUInt16LE(nameBuf.length, 26); // filename length
  h.writeUInt16LE(0, 28); // extra field length
  return Buffer.concat([h, nameBuf, data]);
}

function buildCentralHeader(nameBuf: Buffer, crc: number, size: number, offset: number): Buffer {
  const h = Buffer.alloc(46);
  h.writeUInt32LE(0x02014b50, 0);
  h.writeUInt16LE(20, 4); // version made by
  h.writeUInt16LE(20, 6); // version needed
  h.writeUInt16LE(0, 8); // flags
  h.writeUInt16LE(0, 10); // method: 0 = store
  h.writeUInt16LE(0, 12); // mod time
  h.writeUInt16LE(0, 14); // mod date
  h.writeUInt32LE(crc, 16); // crc32
  h.writeUInt32LE(size, 20); // compressed size
  h.writeUInt32LE(size, 24); // uncompressed size
  h.writeUInt16LE(nameBuf.length, 28); // filename length
  h.writeUInt16LE(0, 30); // extra field length
  h.writeUInt16LE(0, 32); // comment length
  h.writeUInt16LE(0, 34); // disk number
  h.writeUInt16LE(0, 36); // internal attrs
  h.writeUInt32LE(0, 38); // external attrs
  h.writeUInt32LE(offset, 42); // offset of local header
  return Buffer.concat([h, nameBuf]);
}

function buildEocd(centralSize: number, centralOffset: number, count: number): Buffer {
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(count, 8); // entries on this disk
  eocd.writeUInt16LE(count, 10); // total entries
  eocd.writeUInt32LE(centralSize, 12); // central dir size
  eocd.writeUInt32LE(centralOffset, 16); // offset of central dir
  eocd.writeUInt16LE(0, 20); // comment length
  return eocd;
}

/** CRC32 lookup table (IEEE polynomial 0xEDB88320). */
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
