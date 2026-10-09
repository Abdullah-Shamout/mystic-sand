/** Saves a Blob to the user's device via a temporary object URL and <a download>. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has had a chance to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
