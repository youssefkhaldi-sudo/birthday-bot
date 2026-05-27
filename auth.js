const { google } = require('googleapis');
const fs = require('fs');
const readline = require('readline');

const SCOPES = ['https://www.googleapis.com/auth/contacts.readonly'];
const raw = JSON.parse(fs.readFileSync('credentials.json'));
const credentials = raw.installed || raw.web;
const { client_id, client_secret, redirect_uris } = credentials;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'urn:ietf:wg:oauth:2.0:oob');

const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
console.log('\n🔗 Abre este enlace en el navegador:\n');
console.log(authUrl);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('\n📋 Pega aquí el código que te da Google: ', async (code) => {
  rl.close();
  const { tokens } = await oAuth2Client.getToken(code);
  fs.writeFileSync('token.json', JSON.stringify(tokens));
  console.log('\n✅ Token guardado!');
});
