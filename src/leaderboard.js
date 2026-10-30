// Bestenliste: lokal (localStorage) und optional online über Supabase (REST).
// Online aktivieren: .env mit VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY (siehe README).
const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const online = !!(URL_ && KEY);
const LS = 'mkphoto.lb.v1';

function loadLocal() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } }
function saveLocal(d) { try { localStorage.setItem(LS, JSON.stringify(d)); } catch { /* voll/privat */ } }

export async function submitScore({ name, level, mission, score }) {
  const d = loadLocal();
  const k = `${level}:${mission}`;
  (d[k] ||= []).push({ name, score, at: Date.now() });
  d[k].sort((a, b) => b.score - a.score);
  d[k] = d[k].slice(0, 10);
  saveLocal(d);
  if (!online || !name) return;
  try {
    await fetch(`${URL_}/rest/v1/scores`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ name: String(name).slice(0, 24), level, mission, score: Math.round(score) }),
    });
  } catch { /* offline */ }
}

// Gesamtsterne pro Pilot (online) oder lokale Top-Einträge
export async function topScores(level, mission) {
  if (online) {
    try {
      const q = new URLSearchParams({ select: 'name,score,created_at', level: `eq.${level}`, mission: `eq.${mission}`, order: 'score.desc', limit: '10' });
      const r = await fetch(`${URL_}/rest/v1/scores?${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
      if (r.ok) return { online: true, rows: (await r.json()).map((x) => ({ name: x.name, score: x.score })) };
    } catch { /* offline -> lokal */ }
  }
  return { online: false, rows: loadLocal()[`${level}:${mission}`] || [] };
}
