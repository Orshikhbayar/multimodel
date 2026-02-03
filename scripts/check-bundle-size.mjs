import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const chunksDir = path.join(root, ".next", "static", "chunks");
const maxKb = Number(process.env.BUNDLE_SIZE_MAX_KB || 15000);

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

if (!fs.existsSync(chunksDir)) {
  console.error(`Bundle chunks directory not found: ${chunksDir}`);
  process.exit(1);
}

const files = listFiles(chunksDir).filter((file) => file.endsWith(".js"));
const totalBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
const totalKb = Math.round(totalBytes / 1024);

console.log(`Bundle size (raw JS chunks): ${totalKb} KB`);
console.log(`Max allowed: ${maxKb} KB`);

if (Number.isNaN(maxKb)) {
  console.error("Invalid BUNDLE_SIZE_MAX_KB value.");
  process.exit(1);
}

if (totalKb > maxKb) {
  console.error("Bundle size exceeds limit.");
  process.exit(1);
}

console.log("Bundle size is within limit.");
