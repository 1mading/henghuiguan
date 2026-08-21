/**
 * 进程内 SSE 变更广播：写路径落库后 emit，客户端 soft-pull。
 * 单机部署足够；多进程需再接 Redis pub/sub。
 */

const clients = new Set();
let storeRevision = 0;
let heartbeatTimer = null;

function getStoreRevision() {
  return storeRevision;
}

function bumpRevision() {
  storeRevision += 1;
  return storeRevision;
}

function attachSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

function ensureHeartbeat() {
  if (heartbeatTimer) return;
  heartbeatTimer = setInterval(() => {
    for (const client of [...clients]) {
      try {
        client.res.write(': heartbeat\n\n');
      } catch {
        removeClient(client);
      }
    }
    if (!clients.size && heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }, 25000);
  if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();
}

function addClient(res, meta = {}) {
  const client = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    res,
    userId: meta.userId || null,
    wall: !!meta.wall,
  };
  clients.add(client);
  ensureHeartbeat();
  try {
    res.write(`event: hello\ndata: ${JSON.stringify({
      rev: storeRevision,
      at: new Date().toISOString(),
    })}\n\n`);
  } catch {
    removeClient(client);
    return null;
  }
  return client;
}

function removeClient(client) {
  if (!client) return;
  clients.delete(client);
  try {
    client.res.end();
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} payload
 * @param {string} payload.type  如 task.attachments / data.sync / inbox.updated
 * @param {string} [payload.entityType]
 * @param {string[]} [payload.entityIds]
 * @param {string|null} [payload.actorId]
 * @param {object} [payload.meta] 额外字段并入事件体（如 userIds）
 */
function emitChange(payload = {}) {
  const rev = bumpRevision();
  const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
  const event = {
    type: payload.type || 'data.changed',
    entityType: payload.entityType || null,
    entityIds: Array.isArray(payload.entityIds)
      ? payload.entityIds.filter(Boolean).map(String).slice(0, 200)
      : [],
    actorId: payload.actorId || null,
    at: new Date().toISOString(),
    rev,
    ...meta,
  };
  const chunk = `event: change\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of [...clients]) {
    try {
      client.res.write(chunk);
    } catch {
      removeClient(client);
    }
  }
  return event;
}

function clientCount() {
  return clients.size;
}

module.exports = {
  getStoreRevision,
  bumpRevision,
  attachSseHeaders,
  addClient,
  removeClient,
  emitChange,
  clientCount,
};
