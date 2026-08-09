// netlify/functions/state.js
//
// This is the missing backend piece. The frontend (index.html) calls
// fetch('/api/state', ...) for every load and every save. Netlify runs
// this function on its servers (not in the browser), and it does the
// actual talking to Supabase.
//
// SECURITY NOTE: the values below are hardcoded rather than pulled from
// environment variables, per request. The SERVICE ROLE key bypasses all
// database permissions — anyone who sees it has full read/write/delete
// access to every table. Since it's hardcoded here, it will be visible
// in plain text to anyone who can see this file in your GitHub repo.
// Only do this if your repo is PRIVATE. If it's public, use environment
// variables instead so the key never touches the repo at all.
//
// Requires the netlify.toml redirect (provided alongside this file) so
// that a request to /api/state actually reaches this function.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://sybsgzqtvwufmnvjlwau.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5YnNnenF0dnd1Zm1udmpsd2F1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjIzMDU3MiwiZXhwIjoyMTAxODA2NTcyfQ.gNo3luLLPqGp-OjBtgO_QJOxT8l4QWpMGjMy-RqpOXI';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// How recently someone must have "heartbeat"-ed to count as currently online.
// The frontend heartbeats every 7s, so 30s comfortably covers normal polling
// gaps without leaving people showing as "online" long after they've left.
const PRESENCE_TTL_MS = 30000;

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'GET') {
      return await getState();
    }
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      return await handleAction(body.action, body);
    }
    return { statusCode: 405, body: 'Method not allowed' };
  } catch (err) {
    console.error('state function error:', err);
    return json(500, { error: err.message || 'Internal error' });
  }
};

async function getState() {
  const [entries, meetings, companies, leaders, awarded, presence] = await Promise.all([
    supabase.from('entries').select('*'),
    supabase.from('meetings').select('*'),
    supabase.from('custom_companies').select('*'),
    supabase.from('leader_selections').select('*'),
    supabase.from('awarded_selections').select('*'),
    supabase.from('presence').select('*'),
  ]);

  for (const r of [entries, meetings, companies, leaders, awarded, presence]) {
    if (r.error) throw new Error(r.error.message);
  }

  const now = Date.now();
  const activeUsers = (presence.data || [])
    .filter((p) => now - new Date(p.last_seen).getTime() < PRESENCE_TTL_MS)
    .map((p) => p.user_name);

  return json(200, {
    entries: entries.data || [],
    meetings: meetings.data || [],
    customCompanies: companies.data || [],
    leaderSelections: (leaders.data || []).map((r) => ({
      scopeKey: r.scope_key, subName: r.sub_name, pickedBy: r.picked_by,
    })),
    awardedSelections: (awarded.data || []).map((r) => ({
      scopeKey: r.scope_key, subName: r.sub_name, awardedBy: r.awarded_by,
    })),
    activeUsers,
  });
}

async function handleAction(action, body) {
  switch (action) {
    case 'insertEntry': {
      const { error } = await supabase.from('entries').insert(body.row);
      if (error) throw new Error(error.message);
      break;
    }
    case 'updateEntry': {
      const { error } = await supabase.from('entries').update(entryPatch(body.patch)).eq('id', body.id);
      if (error) throw new Error(error.message);
      break;
    }
    case 'deleteEntry': {
      const { error } = await supabase.from('entries').delete().eq('id', body.id);
      if (error) throw new Error(error.message);
      break;
    }
    case 'deleteEntriesForDate': {
      const { error } = await supabase.from('entries').delete().eq('date', body.date);
      if (error) throw new Error(error.message);
      break;
    }
    case 'insertMeeting': {
      const { error } = await supabase.from('meetings').insert(body.row);
      if (error) throw new Error(error.message);
      break;
    }
    case 'updateMeeting': {
      const { error } = await supabase.from('meetings').update(meetingPatch(body.patch)).eq('id', body.id);
      if (error) throw new Error(error.message);
      break;
    }
    case 'deleteMeeting': {
      const { error } = await supabase.from('meetings').delete().eq('id', body.id);
      if (error) throw new Error(error.message);
      break;
    }
    case 'deleteMeetingsForDate': {
      const { error } = await supabase.from('meetings').delete().eq('date', body.date);
      if (error) throw new Error(error.message);
      break;
    }
    case 'insertCompany': {
      const { error } = await supabase.from('custom_companies').insert(body.row);
      if (error) throw new Error(error.message);
      break;
    }
    case 'setLeader': {
      const { error } = await supabase.from('leader_selections').upsert({
        scope_key: body.key, sub_name: body.subName, picked_by: body.by, updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      break;
    }
    case 'setAwarded': {
      const { error } = await supabase.from('awarded_selections').upsert({
        scope_key: body.key, sub_name: body.subName, awarded_by: body.by, updated_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      break;
    }
    case 'clearAwarded': {
      const { error } = await supabase.from('awarded_selections').delete().eq('scope_key', body.key);
      if (error) throw new Error(error.message);
      break;
    }
    case 'heartbeat': {
      const { error } = await supabase.from('presence').upsert({
        user_name: body.name, last_seen: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      break;
    }
    default:
      return json(400, { error: `Unknown action: ${action}` });
  }
  return json(200, { ok: true });
}

function entryPatch(patch) {
  const row = {};
  if ('date' in patch) row.date = patch.date;
  if ('sentToOwnership' in patch) row.sent_to_ownership = !!patch.sentToOwnership;
  if ('followUpComplete' in patch) row.follow_up_complete = !!patch.followUpComplete;
  if ('notes' in patch) row.notes = patch.notes;
  if ('lastEditedBy' in patch) row.last_edited_by = patch.lastEditedBy;
  return row;
}
function meetingPatch(patch) {
  const row = {};
  if ('date' in patch) row.date = patch.date;
  if ('startMinutes' in patch) row.start_minutes = patch.startMinutes;
  if ('duration' in patch) row.duration = patch.duration;
  if ('subName' in patch) row.sub_name = patch.subName;
  if ('lastEditedBy' in patch) row.last_edited_by = patch.lastEditedBy;
  return row;
}
function json(statusCode, obj) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      // Without this, Netlify's CDN can cache a GET response and serve that
      // same stale snapshot to other visitors instead of hitting Supabase
      // fresh each time — which looks exactly like "it's not auto-updating."
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
    body: JSON.stringify(obj),
  };
}
