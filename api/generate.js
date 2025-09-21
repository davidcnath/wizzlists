// Vercel Serverless Function: /api/generate  (GET, SSE)
// Query: ?topic=&limit=10&mode=fast|accurate
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  const topic = String(req.query.topic || '').trim();
  let limit = Math.min(20, Math.max(1, Number(req.query.limit || 10)));
  const mode = req.query.mode === 'accurate' ? 'accurate' : 'fast';
  if (!topic) return res.status(400).json({ error: 'Missing ?topic' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let sent = 0;
  const makeId = () => Math.random().toString(36).slice(2, 10);
  const makeItem = (i) => ({
    id: makeId(),
    title: `${topic} — Item ${i + 1}`,
    url: 'https://example.com',
    blurb: `This is a placeholder for “${topic}” #${i + 1}.`,
    popularity: Math.round(50 + Math.random() * 50),
  });

  const timer = setInterval(() => {
    if (sent >= limit) {
      clearInterval(timer);
      send('done', { count: sent, mode });
      return res.end();
    }
    send('item', makeItem(sent));
    sent++;
  }, 150);

  req.on('close', () => clearInterval(timer));
}
