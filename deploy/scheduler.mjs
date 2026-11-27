import { setTimeout as delay } from 'node:timers/promises';
const token = process.env.AGGREGATOR_TOKEN;
if (!token || token.length < 24) throw new Error('AGGREGATOR_TOKEN is missing or too short');
while (true) {
  try {
    const response = await fetch('http://web:3100/api/admin/catalogue', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    console.log(JSON.stringify({ time: new Date().toISOString(), status: response.status }));
  } catch { console.error('Catalogue scheduler could not reach the application; retrying in five minutes.'); }
  await delay(5 * 60000);
}
