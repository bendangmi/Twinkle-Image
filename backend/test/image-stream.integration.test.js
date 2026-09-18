const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const BACKEND_DIR = path.resolve(__dirname, '..');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  server.closeAllConnections?.();
  return new Promise(resolve => server.close(resolve));
}

async function waitFor(predicate, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw lastError || new Error('Timed out waiting for condition');
}

async function stopBackend(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  const stopped = await Promise.race([
    new Promise(resolve => child.once('exit', () => resolve(true))),
    new Promise(resolve => setTimeout(() => resolve(false), 3000)),
  ]);
  if (!stopped && child.exitCode === null) {
    child.kill('SIGKILL');
    await new Promise(resolve => child.once('exit', resolve));
  }
}

test('retries an unsupported partial-images request without stream parameters', async t => {
  const upstreamRequests = [];
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    upstreamRequests.push(body);

    if (body.stream) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Unsupported parameter: partial_images' } }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: [{ b64_json: Buffer.from('image').toString('base64') }] }));
  });
  const upstreamPort = await listen(upstream);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-image-stream-'));

  const portProbe = http.createServer();
  const backendPort = await listen(portProbe);
  await close(portProbe);

  const child = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(backendPort),
      NOVA_TASK_DB: path.join(tempDir, 'database', 'tasks.sqlite'),
      NOVA_IMAGE_DIR: path.join(tempDir, 'images'),
      NOVA_IMAGE_PARTIAL_IMAGES: '2',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let backendOutput = '';
  child.stdout.on('data', chunk => { backendOutput += chunk; });
  child.stderr.on('data', chunk => { backendOutput += chunk; });
  t.after(async () => {
    await stopBackend(child);
    await close(upstream);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const backendUrl = `http://127.0.0.1:${backendPort}`;
  await waitFor(async () => {
    if (child.exitCode !== null) throw new Error(`Backend exited early:\n${backendOutput}`);
    const response = await fetch(`${backendUrl}/api/nova/queue-status`);
    return response.ok;
  });

  const createResponse = await fetch(`${backendUrl}/api/nova/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: 'test-key',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      protocol: 'openai',
      mode: 'text-to-image',
      prompt: 'test image',
      model: 'gpt-image-1',
      parallelCount: 1,
      outputSize: 'auto',
      aspectRatio: 'auto',
      images: [],
    }),
  });
  assert.equal(createResponse.status, 202);
  const { taskId } = await createResponse.json();

  const task = await waitFor(async () => {
    const response = await fetch(`${backendUrl}/api/nova/tasks/${taskId}`);
    const value = await response.json();
    return ['completed', 'failed'].includes(value.status) ? value : null;
  });

  assert.equal(task.status, 'completed', backendOutput);
  assert.equal(upstreamRequests.length, 2);
  assert.equal(upstreamRequests[0].stream, true);
  assert.equal(upstreamRequests[0].partial_images, 2);
  assert.equal('stream' in upstreamRequests[1], false);
  assert.equal('partial_images' in upstreamRequests[1], false);
});

test('handles mislabeled image streams and empty upstream responses', async t => {
  const upstreamRequests = [];
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    upstreamRequests.push(body);

    if (body.prompt === 'mislabeled stream') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Request-Id': 'stream_req_1',
      });
      res.end(`data: ${JSON.stringify({
        type: 'image_generation.completed',
        b64_json: Buffer.from('stream-image').toString('base64'),
      })}\n\ndata: [DONE]\n\n`);
      return;
    }

    if (body.prompt === 'empty stream fallback' && body.stream) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'X-Request-Id': 'empty_stream_req_2',
      });
      res.end();
      return;
    }

    if (body.prompt === 'empty stream fallback') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: [{ b64_json: Buffer.from('fallback-image').toString('base64') }],
      }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Request-Id': 'empty_req_3',
    });
    res.end();
  });
  const upstreamPort = await listen(upstream);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-image-response-'));

  const portProbe = http.createServer();
  const backendPort = await listen(portProbe);
  await close(portProbe);

  const child = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(backendPort),
      NOVA_TASK_DB: path.join(tempDir, 'database', 'tasks.sqlite'),
      NOVA_IMAGE_DIR: path.join(tempDir, 'images'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let backendOutput = '';
  child.stdout.on('data', chunk => { backendOutput += chunk; });
  child.stderr.on('data', chunk => { backendOutput += chunk; });
  t.after(async () => {
    await stopBackend(child);
    await close(upstream);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const backendUrl = `http://127.0.0.1:${backendPort}`;
  await waitFor(async () => {
    if (child.exitCode !== null) throw new Error(`Backend exited early:\n${backendOutput}`);
    const response = await fetch(`${backendUrl}/api/nova/queue-status`);
    return response.ok;
  });

  const runImageTask = async prompt => {
    const createResponse = await fetch(`${backendUrl}/api/nova/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: 'test-key',
        baseUrl: `http://127.0.0.1:${upstreamPort}`,
        protocol: 'openai',
        mode: 'text-to-image',
        prompt,
        model: 'gpt-image-1',
        parallelCount: 1,
        maxRetries: 0,
        outputSize: 'auto',
        aspectRatio: 'auto',
        images: [],
      }),
    });
    assert.equal(createResponse.status, 202);
    const { taskId } = await createResponse.json();
    return waitFor(async () => {
      const response = await fetch(`${backendUrl}/api/nova/tasks/${taskId}`);
      const value = await response.json();
      return ['completed', 'failed'].includes(value.status) ? value : null;
    });
  };

  const mislabeledStreamTask = await runImageTask('mislabeled stream');
  assert.equal(mislabeledStreamTask.status, 'completed', backendOutput);

  const fallbackTask = await runImageTask('empty stream fallback');
  assert.equal(fallbackTask.status, 'completed', backendOutput);

  const emptyTask = await runImageTask('always empty');
  assert.equal(emptyTask.status, 'failed', backendOutput);
  assert.match(emptyTask.error, /上游返回空响应/);
  assert.match(emptyTask.error, /HTTP 200/);
  assert.match(emptyTask.error, /Content-Type: application\/json/);
  assert.match(emptyTask.error, /Request-ID: empty_req_3/);

  const fallbackRequests = upstreamRequests.filter(request => request.prompt === 'empty stream fallback');
  assert.equal(fallbackRequests.length, 2);
  assert.equal(fallbackRequests[0].stream, true);
  assert.equal('stream' in fallbackRequests[1], false);
});

test('preserves upstream text and image errors for users and server logs', async t => {
  const upstream = http.createServer(async (req, res) => {
    await new Promise((resolve, reject) => {
      req.on('end', resolve);
      req.on('error', reject);
      req.resume();
    });

    if (req.url === '/v1/responses') {
      res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('text quota exhausted; request_id=text_req_9');
      return;
    }

    if (req.url === '/v1/images/generations') {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: {
          message: 'image quota exhausted',
          code: 'billing_hard_limit',
          type: 'insufficient_quota',
        },
        request_id: 'image_req_7',
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });
  const upstreamPort = await listen(upstream);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-model-errors-'));

  const portProbe = http.createServer();
  const backendPort = await listen(portProbe);
  await close(portProbe);

  const child = spawn(process.execPath, ['server.js'], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(backendPort),
      NOVA_TASK_DB: path.join(tempDir, 'database', 'tasks.sqlite'),
      NOVA_IMAGE_DIR: path.join(tempDir, 'images'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let backendOutput = '';
  child.stdout.on('data', chunk => { backendOutput += chunk; });
  child.stderr.on('data', chunk => { backendOutput += chunk; });
  t.after(async () => {
    await stopBackend(child);
    await close(upstream);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const backendUrl = `http://127.0.0.1:${backendPort}`;
  await waitFor(async () => {
    if (child.exitCode !== null) throw new Error(`Backend exited early:\n${backendOutput}`);
    const response = await fetch(`${backendUrl}/api/nova/queue-status`);
    return response.ok;
  });

  const textResponse = await fetch(`${backendUrl}/api/nova/proxy/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      protocol: 'openai-responses',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      apiKey: 'test-key',
      model: 'text-model',
      stream: true,
      requestBody: { model: 'text-model', input: 'hello', stream: true },
    }),
  });
  assert.equal(textResponse.status, 429);
  assert.deepEqual(await textResponse.json(), {
    error: { message: 'text quota exhausted; request_id=text_req_9' },
    upstreamStatus: 429,
  });

  const createResponse = await fetch(`${backendUrl}/api/nova/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey: 'test-key',
      baseUrl: `http://127.0.0.1:${upstreamPort}`,
      protocol: 'openai',
      mode: 'text-to-image',
      prompt: 'test image',
      model: 'gpt-image-1',
      parallelCount: 1,
      maxRetries: 0,
      outputSize: 'auto',
      aspectRatio: 'auto',
      images: [],
    }),
  });
  assert.equal(createResponse.status, 202);
  const { taskId } = await createResponse.json();

  const task = await waitFor(async () => {
    const response = await fetch(`${backendUrl}/api/nova/tasks/${taskId}`);
    const value = await response.json();
    return ['completed', 'failed'].includes(value.status) ? value : null;
  });

  assert.equal(task.status, 'failed', backendOutput);
  assert.match(task.error, /image quota exhausted/);
  assert.match(task.error, /billing_hard_limit/);
  assert.match(task.error, /image_req_7/);
  assert.match(backendOutput, /\[model-upstream-error\] text-proxy/);
  assert.match(backendOutput, /\[model-upstream-error\] image-generation/);
});
