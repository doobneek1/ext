const fs = require("fs");
const stringSimilarity = require("string-similarity");
const locations = require("./locations.json");

function groupOrgsByName(locations) {
  const orgMap = new Map();
  const usedOrgIds = new Set();
  const grouped = [];

  for (const loc of locations) {
    const orgId = loc.id;
    const orgName = (loc.name || "").trim();
    if (!orgId || !orgName) continue;
    orgMap.set(orgId, orgName);
  }

  const orgEntries = Array.from(orgMap.entries());
  
  for (let i = 0; i < orgEntries.length; i++) {
    const [orgIdA, nameA] = orgEntries[i];
    if (usedOrgIds.has(orgIdA)) continue;

    const groupIds = { [orgIdA]: true };
    const cleanedA = nameA.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();

    for (let j = i + 1; j < orgEntries.length; j++) {
      const [orgIdB, nameB] = orgEntries[j];
      if (usedOrgIds.has(orgIdB)) continue;

      const cleanedB = nameB.toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim();
      const similarity = stringSimilarity.compareTwoStrings(cleanedA, cleanedB);

      if (similarity > 0.7) {
        groupIds[orgIdB] = true;
        usedOrgIds.add(orgIdB);
      }
    }

    if (Object.keys(groupIds).length >= 2) {
      grouped.push({ name: cleanedA, ids: groupIds });
      usedOrgIds.add(orgIdA);
    }
  }

  const result = {};
  for (const group of grouped) {
    result[group.name] = group.ids;
  }

    return result;
}

const groupedOrgs = groupOrgsByName(locations);

// 💾 Write to file
fs.writeFileSync("grouped_orgs.json", JSON.stringify(groupedOrgs, null, 2));
