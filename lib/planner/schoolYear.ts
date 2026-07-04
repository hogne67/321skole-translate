export function getNextSchoolYear(value: string): string {
  const trimmed = value.trim();
  const range = trimmed.match(/(\d{4})\D+(\d{4})/);

  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      return `${start + 1}/${end + 1}`;
    }
  }

  const single = trimmed.match(/\d{4}/);
  if (single) {
    const year = Number(single[0]);
    if (Number.isFinite(year)) return `${year + 1}/${year + 2}`;
  }

  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  return `${start}/${start + 1}`;
}

export function titleForCopiedPlanner(title: string, currentSchoolYear: string, nextSchoolYear: string): string {
  const cleanTitle = title.trim() || "Kopiert plan";
  if (currentSchoolYear && cleanTitle.includes(currentSchoolYear)) {
    return cleanTitle.replace(currentSchoolYear, nextSchoolYear);
  }

  return `${cleanTitle} (${nextSchoolYear})`;
}
