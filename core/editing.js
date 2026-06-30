import fs from "fs";
import path from "path";

function readLines(filePath) {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/);
}

function writeLines(filePath, lines) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

function numbered(lines, start = 1) {
  return lines.map((line, i) => `${String(start + i).padStart(5)}  ${line}`).join("\n");
}

export function previewRange(filePath, startLine = 1, lineCount = 80) {
  const lines = readLines(filePath);
  const start = Math.max(1, Number(startLine));
  const count = Math.min(500, Math.max(1, Number(lineCount)));
  return numbered(lines.slice(start - 1, start - 1 + count), start);
}

export function replaceRange(filePath, startLine, endLine, content) {
  const lines = readLines(filePath);
  const start = Math.max(1, Number(startLine));
  const end = Math.max(start, Number(endLine));
  const next = String(content ?? "").split(/\r?\n/);
  lines.splice(start - 1, end - start + 1, ...next);
  writeLines(filePath, lines);
  return { filePath, startLine: start, endLine: end, insertedLines: next.length };
}

export function insertAfter(filePath, afterLine, content) {
  const lines = readLines(filePath);
  const after = Math.max(0, Number(afterLine));
  const next = String(content ?? "").split(/\r?\n/);
  lines.splice(after, 0, ...next);
  writeLines(filePath, lines);
  return { filePath, afterLine: after, insertedLines: next.length };
}

export function deleteRange(filePath, startLine, endLine) {
  const lines = readLines(filePath);
  const start = Math.max(1, Number(startLine));
  const end = Math.max(start, Number(endLine));
  const removed = lines.splice(start - 1, end - start + 1);
  writeLines(filePath, lines);
  return { filePath, startLine: start, endLine: end, removedLines: removed.length };
}
