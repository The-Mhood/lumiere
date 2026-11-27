// Run on your administration machine with the private env file; never send it
// to a third-party checker or expose the token in command-line arguments.
const input = process.argv[2];
if (!input) throw new Error('Usage: node --env-file=deploy/.env scripts/preflight-deployment.mjs https://your-domain');
const endpoint = new URL(input);
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error('Provide a clean HTTPS origin');
const token = process.env.AGGREGATOR_TOKEN;
if (!token || token.length < 24) throw new Error('Load private AGGREGATOR_TOKEN using --env-file; never put it in command-line arguments');
const health = await fetch(`${endpoint.origin}/api/health`, { redirect: 'error', signal: AbortSignal.timeout(20000) });
if (!health.ok || !(await health.json()).ok) throw new Error('Website database health check failed');
const response = await fetch(`${endpoint.origin}/api/admin/readiness`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Private readiness check HTTP ${response.status}`);
const report = await response.json();
console.log(JSON.stringify(report, null, 2));
if (!report.movieLookupReady) throw new Error('Movie lookup configuration is not ready. Check TMDB credential, worker connectivity and adapter parity.');
if (process.argv.includes('--require-tv') && !report.tvLookupReady) throw new Error('No matching TV adapter is configured');
console.log('Configuration checks passed. Next gate: actual browser playback + seeking on the permanent host, then in installed Windows/macOS apps.');
