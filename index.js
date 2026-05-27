const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const { google } = require('googleapis');
const fs = require('fs');

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

  console.log(`📋 Total contactos leídos: ${contacts.length}`);
  return contacts;
}

const client = new Client({ authStrategy: new LocalAuth() });

client.on('qr', (qr) => {
  console.log('\n📱 Escanea este QR con tu WhatsApp:\n');
  qrcode.generate(qr, { small: true });
});

async function checkBirthdays() {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  console.log(`📅 Revisando cumpleaños para hoy: ${mm}-${dd}`);

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

      console.log(`👤 ${name} | 📞 ${phone} | 🎂 ${bMM}-${bDD}`);

      if (bMM === mm && bDD === dd) {
        try {
          const numberId = await client.getNumberId(phone);
          if (!numberId) {
            console.log(`⚠️ Número no encontrado en WhatsApp: ${phone}`);
            continue;
          }
          await client.sendMessage(numberId._serialized, `🎂 ¡Feliz cumpleaños ${name}! Que tengas un día increíble 🎉`);
          console.log(`✅ Mensaje enviado a ${name}!`);
        } catch (e) {
          console.log(`❌ Error enviando a ${name}: ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.log('❌ Error leyendo Google Contacts:', e.message);
  }
}

client.on('ready', async () => {
  console.log('\n✅ Bot conectado y listo!\n');
  await new Promise(r => setTimeout(r, 3000));
  await checkBirthdays();
  cron.schedule('0 9 * * *', checkBirthdays);
});

client.initialize();
