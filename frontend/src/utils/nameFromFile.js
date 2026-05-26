/**
 * Extract a clean vendor name from a filename.
 *
 * Examples:
 *   vendor_b_infosys_msa.txt      → "Infosys"
 *   vendor_a_accenture_msa.txt    → "Accenture"
 *   deloitte_sow_v3_detailed.txt  → "Deloitte"
 *   Accenture_MSA_2025.pdf        → "Accenture"
 *   my-contract.docx              → "My Contract"
 *
 * Strategy:
 *   1. Strip extension
 *   2. Remove common suffixes: _msa, _sow, _nda, _v1, _v2, _2024, _2025, _detailed, _final etc.
 *   3. Remove common prefixes: vendor_a_, vendor_b_, vendor_1_ etc.
 *   4. Split on _ or - or space, capitalise each word
 *   5. Return the first meaningful word (usually the company name)
 */
export function nameFromFile(filename) {
  if (!filename) return ""

  // Strip extension
  let name = filename.replace(/\.[^.]+$/, "")

  // Remove vendor_a_ / vendor_b_ / vendor_1_ prefix
  name = name.replace(/^vendor[_\-][a-z0-9][_\-]/i, "")

  // Remove common contract-type suffixes (order matters — longest first)
  const suffixes = [
    "master_services_agreement", "master_service_agreement",
    "statement_of_work", "non_disclosure_agreement",
    "_msa", "_sow", "_nda", "_psa", "_ssa", "_mou",
    "_agreement", "_contract", "_proposal",
    "_detailed", "_final", "_draft", "_signed", "_executed",
    "_v\\d+", "_\\d{4}", "_\\d{2}",   // _v3, _2025, _25
  ]
  for (const s of suffixes) {
    name = name.replace(new RegExp(s + "$", "i"), "")
  }

  // Split on separators, capitalise, take first meaningful token
  const words = name
    .split(/[_\-\s]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .filter(w => w.length > 1)

  // Return just the first word (company name) — e.g. "Infosys", "Accenture", "Deloitte"
  return words[0] || name
}
