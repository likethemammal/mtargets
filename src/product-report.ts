/**
 * Format product validate reports for agents / Paperclip comments.
 * @category ProductReport
 */

import type {
  ProductResultStatus,
  ProductValidateReport,
  ProductValidateResultRow,
} from "./product-validate.js";

const STATUS_MARK: Record<ProductResultStatus, string> = {
  pass: "✅",
  warn: "⚠️",
  fail: "❌",
  noData: "➖",
};

function fmtNum(n: number | undefined): string {
  if (n === undefined) return "—";
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(4)));
}

function fmtDelta(n: number | undefined): string {
  if (n === undefined) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${fmtNum(n)}`;
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function rowCells(r: ProductValidateResultRow): string {
  const metric = escapeCell(r.label ?? r.key);
  const route = escapeCell(r.route ?? "—");
  const status = `${STATUS_MARK[r.status]} ${r.status}`;
  return `| ${metric} | ${route} | ${status} | ${fmtNum(r.actual)} | ${fmtNum(r.tiers.good)} | ${fmtNum(r.tiers.warn)} | ${fmtDelta(r.delta_from_baseline)} |`;
}

/**
 * Markdown table (route × metric) with status marks for Paperclip comments.
 * @category ProductReport
 */
export function formatAgentMarkdown(report: ProductValidateReport): string {
  const { summary } = report;
  const lines: string[] = [
    `## mtargets report — ${escapeCell(report.spec)}`,
    "",
    `- Evaluated: \`${report.evaluatedAt}\``,
    `- Data: ${escapeCell(report.dataSource)}`,
    `- Summary: **${summary.pass}** pass · **${summary.warn}** warn · **${summary.fail}** fail · **${summary.noData}** noData`,
    "",
    "| Metric | Route | Status | Actual | Good | Warn | Δ baseline |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: |",
  ];

  const order: Record<ProductResultStatus, number> = {
    fail: 0,
    warn: 1,
    pass: 2,
    noData: 3,
  };
  const sorted = [...report.results].sort((a, b) => {
    const so = order[a.status] - order[b.status];
    if (so !== 0) return so;
    const k = a.key.localeCompare(b.key);
    if (k !== 0) return k;
    return (a.route ?? "").localeCompare(b.route ?? "");
  });

  for (const r of sorted) {
    lines.push(rowCells(r));
  }

  lines.push("");
  return lines.join("\n");
}
