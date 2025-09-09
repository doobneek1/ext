
const fs = require("fs");

const filePath = process.argv[2];
if (!filePath) {
  console.error(" Provide a file path: node cleanJsx.js ./file.jsx");
  process.exit(1);
}

let input = fs.readFileSync(filePath, "utf-8");

// 1. Remove single-line comments (//...)
input = input.replace(/(^|[^:"'])\/\/.*(?=[\n\r])/g, (match, prefix) => {
  return prefix === ":" || prefix === "'" || prefix === '"' ? match : prefix;
});

// 2. Remove JSX block comments ({/* ... */})
input = input.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// 3. Remove fully unused useState destructures
const useStatePattern = /const\s+\[\s*(\w+)\s*,\s*(\w+)\s*\]\s*=\s*useState\([^)]*\);?/g;
input = input.replace(useStatePattern, (match, val1, val2) => {
  const temp = input.replace(match, "");
  const val1Used = new RegExp(`\\b${val1}\\b`).test(temp);
  const val2Used = new RegExp(`\\b${val2}\\b`).test(temp);
  return !val1Used && !val2Used ? "" : match;
});

// 4. Remove empty lines
const cleaned = input
  .split(/\r?\n/)
  .filter((line) => line.trim() !== "")
  .join("\n");

fs.writeFileSync(filePath, cleaned, "utf-8");

