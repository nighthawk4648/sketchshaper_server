// Only same-site paths may be used as "go back to" targets (blocks //evil.com, /\evil.com, control chars)
export const safeNext = (value) =>
  typeof value === "string" && value.length <= 500 && /^\/(?![/\\])[^\u0000-\u001f]*$/.test(value) ? value : "/";
