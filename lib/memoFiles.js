// Staff memo file rules (images / PDFs) — kept apart from lib/memos.js so the upload helper doesn't pull in the text parser.
export const MEMO_BUCKET = "staff-memos";
export const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif"];
export const ATTACHMENT_EXTS = ["pdf"];
export const MAX_IMAGE_MB = 10;
export const MAX_PDF_MB = 20;
