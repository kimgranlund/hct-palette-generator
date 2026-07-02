#!/usr/bin/env node
// voice-check.mjs — the mechanical half of the NONOUN voice gate. Checks customer-facing copy for the
// failures a machine can catch: banned lexicon, hype-price phrasing, exclamation discipline, drifted
// pinned facts, and em-dash-pivot overuse. The judged half (persona, posture, claim discipline) is the
// rubric in .claude/docs/marketing/voice/voice-platform.md §6 — this script never scores those.
//
// Usage: node voice-check.mjs <file.md> [more files…]   (exit 1 on any ERROR; warnings don't fail)
import { readFileSync } from "node:fs";

// Banned lexicon (platform §5). Extend HERE, not in prose — word-boundary, case-insensitive.
const BANNED = [
  "AI-powered", "game-changing", "game changer", "stunning", "gorgeous", "effortless", "seamless",
  "magic", "magical", "blazingly fast", "blazing-fast", "next-generation", "next-gen", "cutting-edge",
  "revolutionary", "revolutionize", "supercharge", "supercharged", "unleash", "empower", "empowering",
  "leverage", "leveraging", "world-class", "best-in-class", "beautifully",
  "intuitive", "powerful", "delightful", "robust", "10x",
];

// Pinned facts (fact-sheet.md). A number next to these nouns must be the pinned value.
const PINNED = [
  { re: /\b(\d+)(?:[-\s]+)(?:semantic[-\s]+)?roles?\b/gi, want: "59", name: "semantic roles" },
  { re: /\b(\d+)\s+categories\b/gi, want: "7", name: "color categories" },
  { re: /\b(\d+)\s+(?:curated\s+)?palettes\s+(?:in\s+)?total\b/gi, want: "336", name: "total curated palettes" },
  { re: /\b(\d+)\s+composing\s+systems?\b/gi, want: "3", name: "composing systems" },
  { re: /\b(\d+)\s+(?:type\s+)?voices\b/gi, want: "7", name: "type voices" },
  { re: /\b(\d+)\s+seats?\s+included\b/gi, want: "5", name: "Studio seats included" },
  { re: /\b(\d+)[-\s]day\s+refund\b/gi, want: "14", name: "refund window" },
];
// Any $ amount in copy must be one of the pinned prices.
const PRICES_OK = new Set(["39", "149", "19", "0"]);

let failed = false;
const report = (file, line, level, msg) => {
  console.log(`${level === "ERROR" ? "✗" : "!"} ${file}:${line} ${level}: ${msg}`);
  if (level === "ERROR") failed = true;
};

for (const file of process.argv.slice(2)) {
  const lines = readFileSync(file, "utf8").split("\n");
  // Rulebook docs (the voice platform, the fact sheet) MENTION banned words and drifted values as
  // rules/examples — they exempt themselves with this pragma near the top. Copy never carries it.
  if (lines.slice(0, 6).some((l) => l.includes("voice-check: rulebook"))) {
    console.log(`- ${file}: rulebook (exempt)`);
    continue;
  }
  let pivots = 0;
  lines.forEach((text, i) => {
    const n = i + 1;

    for (const w of BANNED) {
      if (new RegExp(`(?<![\\w-])${w.replace(/[-\s]/g, "[-\\s]")}(?![\\w-])`, "i").test(text))
        report(file, n, "ERROR", `banned lexicon: "${w}"`);
    }
    if (/\b(?:just|only)\s+\$\d/i.test(text)) report(file, n, "ERROR", 'hype pricing ("just/only $…") — state the price plainly');
    if (/~~.*\$\d.*~~/.test(text)) report(file, n, "ERROR", "strike-through price theatre");
    if (text.includes("!") && !text.includes("🎉") && !/^\s*(?:\/\/|#!)/.test(text) && !/\[!|!\(|!\[|<!--|-->/.test(text))
      report(file, n, "ERROR", 'exclamation mark — the only permitted one is the post-purchase "You\'re Pro. 🎉"');

    for (const p of PINNED) {
      for (const m of text.matchAll(p.re)) {
        if (m[1] !== p.want) report(file, n, "ERROR", `drifted fact: ${p.name} is ${p.want}, copy says ${m[1]}`);
      }
    }
    for (const m of text.matchAll(/\$(\d+(?:\.\d+)?)/g)) {
      if (!PRICES_OK.has(m[1])) report(file, n, "ERROR", `unpinned price $${m[1]} — pinned prices are $39, $149, $19`);
    }

    // Non-live feature in the present tense (a §6 auto-fail). The hosted MCP is the standing case:
    // any mention must carry future/conditional framing. Extend when new dark-flagged features appear.
    if (/hosted\s+(?:Brand-Kit\s+)?MCP|hosted\s+endpoint/i.test(text) &&
        !/when (?:live|it ships)|not yet|will include|hosted when live|isn't live|planned/i.test(text))
      report(file, n, "ERROR", "hosted MCP in present tense — it is not live; use \"when live\" phrasing or omit (fact-sheet rule 2)");

    // The PIVOT construction specifically: "…claim — not/never/no contrast…". Ordinary em-dashes
    // (bullets, appositions) are normal punctuation and not counted.
    if (/ — (?:not|never|no)\b/i.test(text)) pivots += 1;
    // lowercase "nonoun" outside domains/emails/ids (nonoun.io, @nonoun, nonoun-color-tokens are fine)
    if (/\bnonoun\b(?!\.io|-color)/.test(text.replace(/@nonoun/g, "")))
      report(file, n, "WARN", 'lowercase "nonoun" — the maker is always NONOUN (uppercase); ok only in code ids/paths/domains');
    if (/nonoun-color-tokens/.test(text) && !/https?:\/\/|github\.io|`/.test(text))
      report(file, n, "WARN", "internal id in copy — never customer-facing (URLs/code identifiers exempt)");
  });
  if (pivots > 3) report(file, "-", "WARN", `${pivots} em-dash pivot constructions ("… — not …") in one piece — the signature dies as a tic; keep ~one per section`);
}
if (process.argv.length < 3) { console.error("usage: voice-check.mjs <file.md> [more…]"); process.exit(2); }
process.exit(failed ? 1 : 0);
