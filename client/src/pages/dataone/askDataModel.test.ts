import { describe, expect, it } from 'vitest';
import {
  buildRunScopedQuestion,
  isDatasetRowCountQuestion,
  visibleQuestionFromRunScopedContent,
} from './askDataModel.js';

describe('AskData model', () => {
  it('recognizes dataset row-count questions without capturing cleaning questions', () => {
    expect(isDatasetRowCountQuestion('What is the total number of rows in the dataset?')).toBe(true);
    expect(isDatasetRowCountQuestion('How many records are in this file?')).toBe(true);
    expect(isDatasetRowCountQuestion('What is the row count?')).toBe(true);
    expect(isDatasetRowCountQuestion('How many rows were cleaned or quarantined?')).toBe(false);
    expect(isDatasetRowCountQuestion('How many issue cells were detected?')).toBe(false);
  });

  it('adds mandatory run scope while preserving the visible user question', () => {
    const question = 'What is the total number of rows in the dataset?';
    const scoped = buildRunScopedQuestion(question, {
      projectName: 'Titanic quality',
      runId: 'run-891',
      sourceIdentifier: '/Volumes/workspace/dataone/titanic.csv',
    });

    expect(scoped).toContain('run_id="run-891"');
    expect(scoped).toContain('never SUM row_count across runs');
    expect(visibleQuestionFromRunScopedContent(scoped)).toBe(question);
    expect(visibleQuestionFromRunScopedContent(question)).toBe(question);
  });
});
