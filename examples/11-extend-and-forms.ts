/**
 * 11: client.extend() + forms helpers.
 *
 * Build sub-clients that inherit config + middleware. Use the form builders
 * for non-JSON payloads (multipart upload, form-urlencoded login, etc.).
 *
 * Run: npx tsx examples/11-extend-and-forms.ts
 */
import { createClient } from 'amu-http';
import { formData, urlEncoded } from 'amu-http/forms';
import { bearerAuth } from 'amu-http/middleware/auth';

const api = createClient({ baseURL: 'https://api.example.com' });

// Sub-client: same baseURL, but adds auth.
const authed = api.extend({ middleware: [bearerAuth('static-token')] });

// Sub-client: different baseURL, inherits everything else.
const v2 = api.extend({ baseURL: 'https://api.example.com/v2' });

console.log('parent, authed, v2 are 3 distinct clients.');

// Forms: multipart upload (FormData)
const blob = new Blob(['hello'], { type: 'text/plain' });
const upload = formData({
  file: blob,
  name: 'greeting.txt',
  tags: ['demo', 'amu'], // arrays append multiple entries
});
console.log('FormData built. Field count:', Array.from(upload.keys()).length);

// Forms: form-urlencoded login
const login = urlEncoded({ username: 'ada', password: 'lovelace' });
console.log('URLSearchParams:', login.toString());

// Both shapes are auto-detected by the body serializer:
//   await authed.post('/upload', upload)   // multipart/form-data
//   await api.post('/auth/token', login)   // application/x-www-form-urlencoded
