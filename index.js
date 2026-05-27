const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const cron = require('node-cron');
const { google } = require('googleapis');
const fs = require('fs');
const http = require('http');

let qrImageUrl = null;

const server = http.createServer(async (req, res) => {
  if (qrImageUrl) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#111;flex-direction:column">
          <h2 style="color:white;font-family:sans-serif">Escanea con WhatsApp</h2>
          <img src="${qrImageUrl}" style="width:300px"/>
          <p style="color:#aaa;font-family:sans-serif">Recarga la pagina si el QR ha expirado</p>
        </body>
      </html>
    `);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#111">
          <h2 style="color:#25D366;font-family:sans-serif">Bot conectado y funcionando!</h2>
        </body>
      </html>
    `);
  }
});
server.listen(3000, () => console.log('Web QR disponible en puerto 3000'));

function getAuth() {
  const credentials = JSON.parse(fs.readFileSync('credentials.json'));
  const { client_id, client_secret } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'urn:ietf:wg:oauth:2.0:oob');
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync('token.json')));
  return oAuth2Client;
}

async function getAllContacts() {
  const service = google.people({ version: 'v1', auth: getAuth() });
  let contacts = [];
  let pageToken = null;
  do {
    const res = await service.people.connections.list({
      resourceName: 'people/me',
      pageSize: 1000,
      personFields: 'names,phoneNumbers,birthdays',
      pageToken: pageToken
    });
    contacts = contacts.concat(res.data.connections || []);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  console.log(`Total contactos: ${contacts.length}`);
  return contacts;
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', async (qr) => {
  console.log('QR generado - abre el navegador para escanearlo');
  qrcode.generate(qr, { small: true });
  qrImageUrl = await QRCode.toDataURL(qr);
});

async function checkBirthdays() {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  console.log(`Revisando cumpleanos: ${mm}-${dd}`);
  try {
    const contacts = await getAllContacts();
    for (const contact of contacts) {
      const name = contact.names?.[0]?.displayName || 'Amigo';
      const rawPhone = contact.phoneNumbers?.[0]?.value;
      const birthday = contact.birthdays?.[0]?.date;
      if (!rawPhone || !birthday) continue;
      let phone = rawPhone.replace(/\D/g, '');
      if (phone.startsWith('0')) phone = phone.substring(1);
      if (!phone.startsWith('34') && phone.length === 9) phone = '34' + phone;
      const bMM = String(birthday.month).padStart(2, '0');
      const bDD = String(birthday.day).padStart(2, '0');
      if (bMM === mm && bDD === dd) {
        try {
          const numberId = await client.getNumberId(phone);
          if (!numberId) { console.log(`No encontrado: ${phone}`); continue; }
          await client.sendMessage(numberId._serialized, `Happy Birthday ${name}! René Santamaría - English Teacher`);
          console.log(`Mensaje enviado a ${name}!`);
        } catch (e) {
          console.log(`Error enviando a ${name}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.log('Error Google Contacts:', e.message);
  }
}

client.on('ready', async () => {
  console.log('Bot conectado y listo!');
  qrImageUrl = null;
  await new Promise(r => setTimeout(r, 3000));
  await checkBirthdays();
  cron.schedule('0 9 * * *', checkBirthdays);
});

client.initialize();
