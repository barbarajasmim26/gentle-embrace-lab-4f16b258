function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseStorageReference(fileUrl: string) {
  const trimmed = fileUrl.trim();

  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      bucket: "contracts",
      path: safeDecode(trimmed.replace(/^\/+/, "")),
    };
  }

  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/storage\/v1\/object\/(?:sign|public)\/([^/]+)\/(.+)$/i);

    if (!match?.[1] || !match?.[2]) return null;

    return {
      bucket: safeDecode(match[1]),
      path: safeDecode(match[2]),
    };
  } catch {
    return null;
  }
}

export function extractSupabaseStoragePath(fileUrl: string) {
  return parseStorageReference(fileUrl)?.path || "";
}

export function isAbsoluteHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}
