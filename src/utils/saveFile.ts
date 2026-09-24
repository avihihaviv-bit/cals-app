interface DownloadsCapability {
  save(request: { filename: string; data: string }): Promise<{ status: 'saved' | 'delivered' }>;
}

function isDownloadsCapability(value: unknown): value is DownloadsCapability {
  return !!value && typeof (value as DownloadsCapability).save === 'function';
}

export type SaveFileResult = { ok: true } | { ok: false; reason: 'declined' | 'error' };

/**
 * Saves a text file for the user. When running inside the Claude Artifact
 * viewer (window.claude present), uses its `downloads` capability, which
 * shows the viewer a save confirmation — a plain <a download> blob link is
 * a dead no-op there (the sandboxed frame is never granted a real browser
 * download). Falls back to the classic browser download for the
 * standalone hosted build, where window.claude doesn't exist.
 */
export async function saveTextFile(filename: string, content: string): Promise<SaveFileResult> {
  if (window.claude?.use) {
    try {
      const downloads = await window.claude.use('downloads');
      if (isDownloadsCapability(downloads)) {
        await downloads.save({ filename, data: content });
        return { ok: true };
      }
      // downloads capability unavailable in this view — fall through to the browser path below
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code;
      return { ok: false, reason: code === 'declined' ? 'declined' : 'error' };
    }
  }

  try {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
