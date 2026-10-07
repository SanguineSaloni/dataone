import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer as createProbeServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const tsxCli = resolve(projectRoot, 'node_modules/tsx/dist/cli.mjs');
let demoProcess: ChildProcessWithoutNullStreams;
let baseUrl = '';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function reservePort(): Promise<number> {
  const probe = createProbeServer();
  await new Promise<void>((resolvePromise, rejectPromise) => {
    probe.once('error', rejectPromise);
    probe.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve a local demo test port.');
  await new Promise<void>((resolvePromise, rejectPromise) => {
    probe.close((error) => (error ? rejectPromise(error) : resolvePromise()));
  });
  return address.port;
}

async function waitUntilReady(process: ChildProcessWithoutNullStreams): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    let output = '';
    const timeout = setTimeout(() => rejectPromise(new Error(`Demo server did not start:\n${output}`)), 10_000);
    const inspect = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (!output.includes('[DataOne demo only] Open')) return;
      clearTimeout(timeout);
      resolvePromise();
    };
    process.stdout.on('data', inspect);
    process.stderr.on('data', inspect);
    process.once('exit', (code) => {
      clearTimeout(timeout);
      rejectPromise(new Error(`Demo server exited before startup with code ${code}:\n${output}`));
    });
  });
}

async function responseObject(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isObject(body)) throw new Error(`Expected an object response from ${response.url}.`);
  return body;
}

beforeAll(async () => {
  const port = await reservePort();
  baseUrl = `http://127.0.0.1:${port}`;
  demoProcess = spawn(process.execPath, [tsxCli, '--tsconfig', './tsconfig.server.json', './server/demoServer.ts'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATAONE_DEMO_MODE: 'true',
      DATAONE_DEMO_PORT: String(port),
      NODE_ENV: 'development',
    },
    stdio: 'pipe',
  });
  await waitUntilReady(demoProcess);
}, 15_000);

afterAll(async () => {
  if (!demoProcess || demoProcess.exitCode !== null) return;
  demoProcess.kill('SIGTERM');
  await new Promise<void>((resolvePromise) => {
    const timeout = setTimeout(resolvePromise, 5_000);
    demoProcess.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
});

describe('DataOne local demo HTTP API', () => {
  it('lists and serves equivalent CSV, JSON, and Parquet samples', async () => {
    const response = await fetch(`${baseUrl}/api/demo/samples`);
    const body = await responseObject(response);
    if (!Array.isArray(body.samples)) throw new Error('Sample response must contain a samples array.');

    expect(response.status).toBe(200);
    expect(body.samples).toHaveLength(3);
    for (const descriptor of body.samples) {
      if (!isObject(descriptor) || typeof descriptor.url !== 'string' || typeof descriptor.format !== 'string') {
        throw new Error('Sample descriptor is invalid.');
      }
      const sampleResponse = await fetch(`${baseUrl}${descriptor.url}`);
      expect(sampleResponse.status).toBe(200);
      expect((await sampleResponse.arrayBuffer()).byteLength).toBeGreaterThan(100);
    }
  });

  it('runs the alias-only database simulation through controlled target publication', async () => {
    const connectionsResponse = await fetch(`${baseUrl}/api/demo/connections`);
    const connections = await responseObject(connectionsResponse);
    if (!isObject(connections.source) || !isObject(connections.target)) {
      throw new Error('Connection response must contain source and target descriptors.');
    }
    const sourceAlias = connections.source.alias;
    const targetAlias = connections.target.alias;
    if (typeof sourceAlias !== 'string' || typeof targetAlias !== 'string') {
      throw new Error('Connection aliases must be strings.');
    }

    const credentialAttempt = await fetch(`${baseUrl}/api/demo/database/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceConnection: sourceAlias,
        targetConnection: targetAlias,
        sourceLabel: 'MySQL · localhost:3306/mydb · sales.customers',
        targetLabel: 'PostgreSQL · localhost:5432/analytics · public.customers_gold',
        projectName: 'Manager Database Demo',
        workflowRunId: 'database-test-run',
        password: 'not-accepted',
      }),
    });
    expect(credentialAttempt.status).toBe(400);
    const credentialError = await responseObject(credentialAttempt);
    expect(typeof credentialError.error === 'string' ? credentialError.error : '').toContain('governed aliases only');

    const launchResponse = await fetch(`${baseUrl}/api/demo/database/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceConnection: sourceAlias,
        targetConnection: targetAlias,
        sourceLabel: 'MySQL · localhost:3306/mydb · sales.customers',
        targetLabel: 'PostgreSQL · localhost:5432/analytics · public.customers_gold',
        projectName: 'Manager Database Demo',
        workflowRunId: 'database-test-run',
      }),
    });
    const launch = await responseObject(launchResponse);
    if (typeof launch.runId !== 'number') throw new Error('Database demo must return a numeric runId.');

    const stages: Array<Record<string, unknown>> = [];
    for (let poll = 0; poll < 4; poll += 1) {
      stages.push(await responseObject(await fetch(`${baseUrl}/api/jobs/default/runs/${launch.runId}`)));
    }
    const publishingTasks = isObject(stages[2]) && Array.isArray(stages[2].tasks) ? stages[2].tasks : [];
    const completedState = isObject(stages[3]?.state) ? stages[3].state : {};

    expect(
      publishingTasks.some(
        (task) =>
          isObject(task) &&
          task.task_key === 'publish_target' &&
          isObject(task.state) &&
          task.state.life_cycle_state === 'RUNNING'
      )
    ).toBe(true);
    expect(completedState).toMatchObject({ life_cycle_state: 'TERMINATED', result_state: 'SUCCESS' });

    const analyticsResponse = await fetch(`${baseUrl}/api/analytics/query/dashboard_kpis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'JSON_ARRAY', parameters: { run_id: 'database-test-run' } }),
    });
    const analyticsEvents = await analyticsResponse.text();
    expect(analyticsResponse.status).toBe(200);
    expect(analyticsEvents).toContain('Manager Database Demo');
    expect(analyticsEvents).toContain('database-test-run');
    expect(analyticsEvents).toContain('localhost:3306/mydb');
  });
});
