/**
 * Test-only OpenWA gateway mock (never deployed).
 * Implements just enough of the OpenWA REST API for EzyMail's sender:
 *   GET  /api/sessions                          -> session list
 *   POST /api/sessions/:id/messages/send-text   -> accept a message (201)
 * Captured messages are readable at GET /__received for the test suite,
 * which is how the OTP values are obtained WITHOUT a real WhatsApp number.
 */
import http from 'node:http';

const received = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'GET' && url.pathname === '/__received') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(received));
    return;
  }
  if (req.method === 'DELETE' && url.pathname === '/__received') {
    received.length = 0;
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/sessions') {
    if ((req.headers['x-api-key'] || '') !== 'test-gateway-key') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad key' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([{ id: 'ezymail-test', state: 'running' }]));
    return;
  }
  const sendMatch = req.method === 'POST' && /^\/api\/sessions\/([^/]+)\/messages\/send-text$/.exec(url.pathname);
  if (sendMatch) {
    if ((req.headers['x-api-key'] || '') !== 'test-gateway-key') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'forbidden' }));
      return;
    }
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        received.push({ sessionId: decodeURIComponent(sendMatch[1]), chatId: parsed.chatId, text: parsed.text, at: Date.now() });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ messageId: `mock-${Date.now()}` }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad json' }));
      }
    });
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(2785, '127.0.0.1', () => console.log('MOCK_OPENWA_READY'));
