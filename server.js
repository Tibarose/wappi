const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Store clients by instance ID
const clients = {};
const qrCodes = {};

// Initialize a new WhatsApp client
async function initializeClient(instanceId) {
  if (clients[instanceId]) {
    return { success: true, message: 'Client already exists' };
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: instanceId }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    console.log(`QR code generated for instance ${instanceId}`);
    qrcode.toDataURL(qr, (err, url) => {
      if (err) {
        console.error('QR code generation failed:', err);
        return;
      }
      qrCodes[instanceId] = url;
    });
  });

  client.on('ready', () => {
    console.log(`WhatsApp client ${instanceId} is ready!`);
  });

  client.on('auth_failure', (msg) => {
    console.error(`Authentication failure for ${instanceId}:`, msg);
    delete clients[instanceId];
    delete qrCodes[instanceId];
  });

  client.on('disconnected', () => {
    console.log(`Client ${instanceId} disconnected`);
    delete clients[instanceId];
    delete qrCodes[instanceId];
  });

  clients[instanceId] = client;
  await client.initialize();
  return { success: true, message: 'Client initialized' };
}

// Endpoint to create a new instance
app.post('/instance', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || apiKey !== 'your-static-api-key') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  const instanceId = uuidv4();
  await initializeClient(instanceId);
  res.json({ instanceId, apiKey });
});

// Endpoint to get QR code
app.get('/qr/:instanceId', (req, res) => {
  const { instanceId } = req.params;
  const { apiKey } = req.query;
  if (!apiKey || apiKey !== 'your-static-api-key') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  if (qrCodes[instanceId]) {
    res.json({ qr: qrCodes[instanceId] });
  } else {
    res.status(400).json({ error: 'QR code not available' });
  }
});

// Endpoint to send message
app.post('/send/:instanceId', async (req, res) => {
  const { instanceId } = req.params;
  const { apiKey, number, message } = req.body;
  if (!apiKey || apiKey !== 'your-static-api-key') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  if (!number || !message) {
    return res.status(400).json({ error: 'Number and message required' });
  }
  const client = clients[instanceId];
  if (!client) {
    return res.status(400).json({ error: 'Client not initialized' });
  }
  try {
    const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
    await client.sendMessage(chatId, message);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to logout
app.post('/logout/:instanceId', async (req, res) => {
  const { instanceId } = req.params;
  const { apiKey } = req.body;
  if (!apiKey || apiKey !== 'your-static-api-key') {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  const client = clients[instanceId];
  if (client) {
    await client.logout();
    delete clients[instanceId];
    delete qrCodes[instanceId];
    client.initialize();
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'Client not found' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});