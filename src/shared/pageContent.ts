export type PageContentSource = "article" | "main" | "body" | "document" | "fallback";

export type PageContentSnapshot = {
  title?: string;
  url?: string;
  selection?: string;
  headings?: string[];
  articleText?: string;
  mainText?: string;
  bodyText?: string;
  documentText?: string;
};

export type ExtractedPageContext = {
  title: string;
  url: string;
  selection: string;
  domain: string;
  headings: string[];
  pageText: string;
  source: PageContentSource;
  truncated: {
    headings: boolean;
    pageText: boolean;
  };
  timestamp: number;
};

export const PAGE_TEXT_LIMIT = 30_000;
export const PAGE_HEADING_LIMIT = 32;

export function extractPageContentFromSnapshot(
  snapshot: PageContentSnapshot,
  options: { textLimit?: number; headingLimit?: number; now?: number } = {}
): ExtractedPageContext {
  const textLimit = Math.max(0, options.textLimit ?? PAGE_TEXT_LIMIT);
  const headingLimit = Math.max(0, options.headingLimit ?? PAGE_HEADING_LIMIT);
  const source = choosePageTextSource(snapshot);
  const sourceText = source === "fallback" ? "" : snapshot[`${source}Text`];
  const cleanedText = cleanPageText(sourceText || "");
  const pageText = cleanedText.slice(0, textLimit);
  const cleanedHeadings = cleanHeadings(snapshot.headings || []);
  const headings = cleanedHeadings.slice(0, headingLimit);

  return {
    title: cleanInlineText(snapshot.title || ""),
    url: cleanInlineText(snapshot.url || ""),
    selection: cleanPageText(snapshot.selection || ""),
    domain: domainFromUrl(snapshot.url || ""),
    headings,
    pageText,
    source,
    truncated: {
      headings: cleanedHeadings.length > headings.length,
      pageText: cleanedText.length > pageText.length
    },
    timestamp: options.now ?? Date.now()
  };
}

export function cleanPageText(value: string): string {
  const lines = value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .filter((line) => line && !isNoiseLine(line));

  return lines.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

function choosePageTextSource(snapshot: PageContentSnapshot): PageContentSource {
  const candidates: Array<[PageContentSource, string | undefined]> = [
    ["article", snapshot.articleText],
    ["main", snapshot.mainText],
    ["body", snapshot.bodyText],
    ["document", snapshot.documentText]
  ];
  for (const [source, text] of candidates) {
    if (cleanPageText(text || "").length >= 120) {
      return source;
    }
  }
  return candidates.find(([, text]) => cleanPageText(text || "").length > 0)?.[0] || "fallback";
}

function cleanHeadings(headings: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const heading of headings) {
    const cleaned = cleanInlineText(heading);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key) || isNoiseLine(cleaned)) {
      continue;
    }
    seen.add(key);
    output.push(cleaned);
  }
  return output;
}

function cleanInlineText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isNoiseLine(line: string): boolean {
  const normalized = line.toLowerCase();
  if (normalized.length <= 1) {
    return true;
  }
  return [
    /^cookie(s)?\b/,
    /accept all/,
    /privacy policy/,
    /terms of (use|service)/,
    /^subscribe$/,
    /^advertisement$/,
    /^share$/,
    /^menu$/,
    /^navigation$/,
    /^skip to (content|main)/,
    /^all rights reserved/
  ].some((pattern) => pattern.test(normalized));
}
