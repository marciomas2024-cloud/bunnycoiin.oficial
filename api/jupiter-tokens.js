export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'JUPITER_API_KEY não configurada no servidor.' });
  }
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Parâmetro query obrigatório.' });
  }
  const jupiterUrl = `https://api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}`;
  try {
    const upstream = await fetch(jupiterUrl, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(502).json({ error: `Falha ao contatar a Jupiter: ${e.message}` });
  }
}
