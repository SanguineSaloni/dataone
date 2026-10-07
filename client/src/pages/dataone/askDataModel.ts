export interface AskDataRunContext {
  projectName: string;
  runId: string;
  sourceIdentifier: string;
}

const USER_QUESTION_MARKER = 'USER_QUESTION:';
const RUN_CONTEXT_PREFIX = 'DATAONE_RUN_CONTEXT (application-provided; mandatory scope):';

export function isDatasetRowCountQuestion(question: string): boolean {
  const normalized = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const mentionsRecords = /\b(row|rows|record|records)\b/.test(normalized);
  const asksForCount =
    /\bhow many\b/.test(normalized) ||
    /\b(number|count|total)\b/.test(normalized) ||
    /\brow count\b/.test(normalized) ||
    /\brecord count\b/.test(normalized);
  const asksForAnotherMetric = /\b(clean|cleaned|quarantine|quarantined|transform|issue|column|cell)\b/.test(
    normalized
  );

  return mentionsRecords && asksForCount && !asksForAnotherMetric;
}

export function buildRunScopedQuestion(question: string, context: AskDataRunContext): string {
  const trimmed = question.trim();
  return [
    RUN_CONTEXT_PREFIX,
    `project_name=${JSON.stringify(context.projectName)}`,
    `run_id=${JSON.stringify(context.runId)}`,
    `source_identifier=${JSON.stringify(context.sourceIdentifier)}`,
    'Filter run-level answers by this exact run_id. For dataset row totals, select quality_summary.row_count from this one run and never SUM row_count across runs.',
    USER_QUESTION_MARKER,
    trimmed,
  ].join('\n');
}

export function visibleQuestionFromRunScopedContent(content: string): string {
  if (!content.startsWith(RUN_CONTEXT_PREFIX)) return content;
  const marker = `\n${USER_QUESTION_MARKER}\n`;
  const markerIndex = content.indexOf(marker);
  return markerIndex === -1 ? content : content.slice(markerIndex + marker.length);
}
