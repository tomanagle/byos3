import type { LanguageName } from "@uiw/codemirror-extensions-langs";

// Which files the in-app code viewer/editor will open, and how to syntax-highlight them. We only
// open known text/code types under a size cap (the editor is for viewing + small edits, not big
// blobs). Everything else falls back to download. See web-app.md.

/** Max bytes we load into the editor. Larger files: download instead. */
export const MAX_VIEW_BYTES = 1_000_000;

// Extension -> CodeMirror language pack (a subset of @uiw/codemirror-extensions-langs `langs`).
// "" = a known text type with no dedicated highlighter (plain text).
const EXT_LANG: Record<string, LanguageName | ""> = {
  json: "json",
  jsonc: "json",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  md: "markdown",
  markdown: "markdown",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  css: "css",
  scss: "sass",
  sass: "sass",
  less: "less",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cs: "csharp",
  php: "php",
  sql: "sql",
  graphql: "graphql",
  dockerfile: "dockerfile",
  txt: "",
  text: "",
  log: "",
  csv: "",
  tsv: "",
  env: "",
  ini: "",
  conf: "",
  gitignore: "",
};

function extOf(name: string): string {
  const base = name.slice(name.lastIndexOf("/") + 1).toLowerCase();
  const dot = base.lastIndexOf(".");
  // dotfiles like `.gitignore` have no "extension" before the dot; treat the whole tail as the key.
  return dot > 0 ? base.slice(dot + 1) : base.replace(/^\./, "");
}

/** The CodeMirror language for a file name, or null for plain text / unknown. */
export function languageFor(name: string): LanguageName | null {
  const lang = EXT_LANG[extOf(name)];
  return lang ? lang : null;
}

/** Can the in-app editor open this file (known text type + under the size cap)? */
export function isViewableText(name: string, size: number | null): boolean {
  return extOf(name) in EXT_LANG && (size == null || size <= MAX_VIEW_BYTES);
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"]);

/** Is this an image we can show inline (an `<img>` preview, no CORS needed)? */
export function isImage(name: string): boolean {
  return IMAGE_EXT.has(extOf(name));
}
