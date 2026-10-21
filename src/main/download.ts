import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { log } from './logger';

export interface DownloadProgress {
  url: string;
  bytesReceived: number;
  totalBytes: number | null;
  percent: number | null;
}

export type ProgressCb = (p: DownloadProgress) => void;

/**
 * Download a file over HTTP(S) with path-safe destination and optional progress.
 * Rejects on non-2xx, path traversal attempts in destDir resolution are blocked
 * by requiring destPath to stay under destDir.
 */
export function downloadFile(
  url: string,
  destPath: string,
  onProgress?: ProgressCb,
  timeoutMs = 60000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const destDir = path.dirname(destPath);
    fs.mkdirSync(destDir, { recursive: true });

    const resolved = path.resolve(destPath);
    if (!resolved.startsWith(path.resolve(destDir))) {
      reject(new Error('Invalid download path'));
      return;
    }

    const tmp = resolved + '.part';
    const file = fs.createWriteStream(tmp);

    const get = url.startsWith('https') ? https.get : http.get;
    const req = get(url, { timeout: timeoutMs, headers: { 'User-Agent': 'TT-Launcher/1.0' } }, (res) => {
      // Follow one redirect
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* */
        }
        downloadFile(res.headers.location, destPath, onProgress, timeoutMs).then(resolve, reject);
        return;
      }
      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        file.close();
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* */
        }
        reject(new Error(`Download failed HTTP ${res.statusCode} for ${url}`));
        return;
      }

      const total = res.headers['content-length'] ? parseInt(res.headers['content-length'], 10) : null;
      let received = 0;

      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        onProgress?.({
          url,
          bytesReceived: received,
          totalBytes: total,
          percent: total ? Math.round((received / total) * 100) : null,
        });
      });

      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          try {
            fs.renameSync(tmp, resolved);
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      });
    });

    req.on('error', (err) => {
      file.close();
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* */
      }
      log.error('download error', { url, err: String(err) });
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

export function safeExtractHint(zipPath: string): void {
  // Resource packs are ZIPs; we never execute them. Callers only copy into resourcepacks/.
  if (!zipPath.toLowerCase().endsWith('.zip') && !zipPath.toLowerCase().endsWith('.jar')) {
    throw new Error('Unsupported archive type');
  }
}

export function parseGithubAssetUrl(apiJson: unknown): { name: string; url: string; size: number }[] {
  if (!Array.isArray(apiJson)) return [];
  return apiJson
    .filter((a: any) => a && typeof a.browser_download_url === 'string')
    .map((a: any) => ({
      name: String(a.name),
      url: String(a.browser_download_url),
      size: Number(a.size) || 0,
    }));
}
