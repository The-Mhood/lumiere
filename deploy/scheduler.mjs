import { setTimeout as delay } from 'node:timers/promises';
const token = process.env.AGGREGATOR_TOKEN;
if (!token || token.length < 24) throw new Error('AGGREGATOR_TOKEN is missing or too short');
const post = async (path) => {
  const response = await fetch(`http://web:3100${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  return response.status;
};
while (true) {
  try {
    const catalogue = await post('/api/admin/catalogue');
    const health = await post('/api/admin/health');
    console.log(JSON.stringify({ time: new Date().toISOString(), catalogue, health }));
  } catch { console.error('Scheduler could not reach the application; retrying in five minutes.'); }
  await delay(5 * 60000);
}
