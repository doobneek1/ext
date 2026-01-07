import json
# Path to your text file
input_file = "org_names.txt"
output_file = "org_names.json"
# Read lines, strip whitespace, remove empties and duplicates
with open(input_file, "r", encoding="utf-8") as f:
    lines = [line.strip() for line in f if line.strip()]
# Deduplicate (case-insensitive) but preserve original case of first occurrence
seen = set()
unique_lines = []
for line in lines:
    key = line.lower()
    if key not in seen:
        seen.add(key)
        unique_lines.append(line)
# Sort alphabetically
unique_lines.sort()
# Save to JSON file
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(unique_lines, f, ensure_ascii=False, indent=2)
print(f"Converted {len(unique_lines)} org names to JSON → {output_file}")
