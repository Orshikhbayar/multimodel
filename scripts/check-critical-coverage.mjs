#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const THRESHOLD = 85;
const SUMMARY_PATH = path.resolve(
  process.cwd(),
  "coverage/coverage-summary.json",
);
const FINAL_PATH = path.resolve(process.cwd(), "coverage/coverage-final.json");

const CRITICAL_FILES = [
  "lib/rateLimit.ts",
  "lib/api/streamWithTimeout.ts",
  "lib/api/openai.ts",
  "app/api/chat/route.ts",
  "lib/supabase/env.ts",
];

function loadCoverage() {
  if (fs.existsSync(SUMMARY_PATH)) {
    return {
      mode: "summary",
      data: JSON.parse(fs.readFileSync(SUMMARY_PATH, "utf8")),
    };
  }

  if (fs.existsSync(FINAL_PATH)) {
    return {
      mode: "final",
      data: JSON.parse(fs.readFileSync(FINAL_PATH, "utf8")),
    };
  }

  console.error(
    `Coverage report not found. Expected ${SUMMARY_PATH} or ${FINAL_PATH}`,
  );
  process.exit(1);
}

function getLinePctFromFinal(fileCoverage) {
  const statementEntries = Object.entries(fileCoverage.statementMap ?? {});
  if (statementEntries.length === 0) return 0;

  const allLines = new Set();
  const coveredLines = new Set();

  for (const [statementId, location] of statementEntries) {
    const startLine = location?.start?.line;
    const endLine = location?.end?.line;
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) continue;

    for (let line = startLine; line <= endLine; line += 1) {
      allLines.add(line);
      if ((fileCoverage.s?.[statementId] ?? 0) > 0) {
        coveredLines.add(line);
      }
    }
  }

  if (allLines.size === 0) return 0;
  return Number(((coveredLines.size / allLines.size) * 100).toFixed(2));
}

function getLinePct(coverageMode, coverageData, file) {
  if (coverageMode === "summary") {
    const key = Object.keys(coverageData).find((entry) => entry.endsWith(file));
    if (!key) {
      return { missing: true, pct: 0 };
    }
    return {
      missing: false,
      pct: coverageData[key]?.lines?.pct ?? 0,
    };
  }

  const key = Object.keys(coverageData).find((entry) => entry.endsWith(file));
  if (!key) {
    return { missing: true, pct: 0 };
  }

  return {
    missing: false,
    pct: getLinePctFromFinal(coverageData[key]),
  };
}

const coverage = loadCoverage();
const failures = [];

for (const file of CRITICAL_FILES) {
  const result = getLinePct(coverage.mode, coverage.data, file);
  if (result.missing) {
    failures.push(`${file}: missing from coverage summary`);
    continue;
  }

  const linePct = result.pct;
  if (linePct < THRESHOLD) {
    failures.push(`${file}: ${linePct}% < ${THRESHOLD}%`);
  }
}

if (failures.length > 0) {
  console.error(
    "Critical coverage check failed:\n" +
      failures.map((f) => `- ${f}`).join("\n"),
  );
  process.exit(1);
}

console.log(`Critical coverage check passed (>= ${THRESHOLD}% lines).`);
