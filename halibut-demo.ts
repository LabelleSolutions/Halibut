/**
 * Halibut Observability Demo
 *
 * Endpoints:
 *   POST /ingest   — receive {sensor, value}
 *   GET  /events   — last 100 events (JSON)
 *   GET  /metrics  — Prometheus scrape
 *   GET  /         — simple Chart.js dashboard
 *
 * Quick start (from the folder that holds this file):
 *   npm install express prom-client cors
 *   npx ts-node halibut-demo.ts
 */

import express from 'express';
import cors from 'cors';
import { Registry, collectDefaultMetrics, Counter, Gauge } from 'prom-client';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── Prometheus metrics ──────────────────────────────────────────
const register = new Registry();
collectDefaultMetrics({ register });

const eventCounter = new Counter({
  name: 'halibut_ingested_events_total',
  help: 'Total number of events ingested',
  labelNames: ['sensor'],
  registers: [register],
});

const latestSensorValue = new Gauge({
  name: 'halibut_sensor_value_latest',
  help: 'Latest value recorded for each sensor',
  labelNames: ['sensor'],
  registers: [register],
});

// ── In-memory event store (demo only) ───────────────────────────
interface EventRecord {
  timestamp: number;
  sensor: string;
  value: number;
}
const events: EventRecord[] = [];

// Ingest endpoint
app.post('/ingest', (req, res) => {
  const { sensor, value } = req.body;
  if (typeof sensor !== 'string' || typeof value !== 'number') {
    return res
      .status(400)
      .json({ error: 'sensor (string) and value (number) required' });
  }
  const record: EventRecord = { timestamp: Date.now(), sensor, value };
  events.push(record);

  // Update metrics
  eventCounter.inc({ sensor });
  latestSensorValue.set({ sensor }, value);

  res.json({ status: 'ok' });
});

// JSON feed of recent events
app.get('/events', (_, res) => {
  res.json(events.slice(-100).reverse());
});

// Prometheus scrape
app.get('/metrics', async (_, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// Minimal dashboard HTML
app.get('/', (_, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Halibut Demo Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body{font-family:sans-serif;margin:30px;}
    #chart{max-width:800px;}
  </style>
</head>
<body>
  <h1>Halibut Operational Intelligence — Live Feed</h1>
  <canvas id="chart"></canvas>

<script>
const ctx = document.getElementById('chart').getContext('2d');
const chart = new Chart(ctx, {
  type: 'line',
  data: { labels: [], datasets: [] },
  options: { responsive:true, scales:{y:{beginAtZero:true}}}
});

function update() {
  fetch('/events')
    .then(r=>r.json())
    .then(data=>{
      const grouped = {};
      data.forEach(e=>{
        const t = new Date(e.timestamp).toLocaleTimeString();
        if(!grouped[e.sensor]) grouped[e.sensor] = {label:e.sensor, data:[], fill:false};
        grouped[e.sensor].data.unshift({x:t, y:e.value});
      });
      chart.data.labels = [...new Set(data.map(e=>new Date(e.timestamp).toLocaleTimeString()))].reverse();
      chart.data.datasets = Object.values(grouped);
      chart.update();
    });
}
update();
setInterval(update, 5000);
</script>
</body>
</html>
  `);
});

// Start server
app.listen(port, () => {
  console.log(\`Halibut demo listening on http://localhost:\${port}\`);
});