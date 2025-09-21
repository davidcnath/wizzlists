// Vercel Serverless Function: /api/sort  (POST, SSE-style streaming)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const { items, criterion } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Missing items' });
  }
  if (!criterion || typeof criterion !== 'string') {
    return res.status(400).json({ error: 'Missing criterion' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const ids = items.map((i) => i.id).filter(Boolean);
  let confidence = 40 + Math.round(Math.random() * 10);
  let steps = 0;

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const timer = setInterval(() => {
    steps++;

    // Optional attribute event to exercise UI
    if (steps <= 3) {
      const id = ids[Math.floor(Math.random() * ids.length)];
      const val = Math.round(Math.random() * 1000);
      send('attr', { id, key: criterion, value: val, provenance: 'mock' });
    }

    // Rank update
    send('rank', { order: shuffle(ids) });

    // Confidence tick
    confidence = Math.min(100, confidence + 10 + Math.round(Math.random() * 5));
    send('confidence', { value: confidence });

    if (steps >= 4) {
      clearInterval(timer);
      send('done', {});
      return res.end();
    }
  }, 350);

  req.on('close', () => clearInterval(timer));
}
