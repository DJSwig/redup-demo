// src/lib/web-compat.js
// Ensure WHATWG File exists on Node 18 so undici@6 won't crash.
if (typeof globalThis.File === "undefined") {
  const { File } = await import("fetch-blob/file.js");
  globalThis.File = File;
}
