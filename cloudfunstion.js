const allowedOrigins1 = ['https://yourpeer.nyc', 'https://gogetta.nyc'];

const corsOptions1 = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins1.includes(origin.toLowerCase())) {
      callback(null, true);
    } else {
      warn(`❌ Blocked CORS origin: ${origin}`);
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false
};


export const locationNote = onRequest((req, res) => {
  const corsHandler = cors(corsOptions1);
  
  corsHandler(req, res, async () => {
    const db = getDatabase();
    const uuid = req.query.uuid || req.body?.uuid;

    if (!uuid || typeof uuid !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid UUID' });
    }

    const ref = db.ref(`/locationNotes/${uuid}`);

    if (req.method === 'OPTIONS') {
      return res.status(204).send('');
    }

    if (req.method === 'GET') {
      try {
        const snap = await ref.once('value');
        return res.status(200).json({ note: snap.val() || '' });
      } catch (err) {
        console.error('GET error:', err);
        return res.status(500).json({ error: 'Failed to fetch note' });
      }
    }

    if (req.method === 'POST') {
      const { note } = req.body;
      if (typeof note !== 'string') {
        return res.status(400).json({ error: 'Note must be a string' });
      }
      try {
        await ref.set(note);
        console.info(`✅ Saved note for UUID: ${uuid}`);
        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('POST error:', err);
        return res.status(500).json({ error: 'Failed to save note' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  });
});
