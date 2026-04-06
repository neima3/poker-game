/**
 * Server-side Supabase Realtime broadcast via REST API.
 *
 * Supabase JS v2's channel.subscribe().send() pattern opens a WebSocket
 * connection from the serverless function. In a short-lived Vercel function
 * the socket is abandoned before it cleanly closes, counting against the
 * project's concurrent connection limit. Once that limit is hit, *clients*
 * start getting CHANNEL_ERROR when they try to subscribe → stuck reconnecting.
 *
 * The REST Broadcast API sends to all subscribed clients using a plain HTTP
 * POST — no WebSocket, no connection accumulation, identical delivery.
 */
export async function broadcastToChannel(
  topic: string,
  messages: Array<{ event: string; payload: Record<string, unknown> }>,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('[broadcast] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return;
  }

  const body = {
    messages: messages.map(({ event, payload }) => ({ topic, event, payload })),
  };

  try {
    const res = await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[broadcast] ${topic} failed ${res.status}:`, text);
    }
  } catch (err) {
    console.error(`[broadcast] ${topic} network error:`, err);
  }
}

/** Convenience wrapper for table channels. */
export function broadcastToTable(
  tableId: string,
  messages: Array<{ event: string; payload: Record<string, unknown> }>,
) {
  return broadcastToChannel(`table:${tableId}`, messages);
}
