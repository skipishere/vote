const TURN_WORKER_URL = import.meta.env.VITE_TURN_WORKER_URL as string | undefined;

export async function getIceServers(): Promise<RTCIceServer[] | undefined> {
  if (!TURN_WORKER_URL) return undefined;
  try {
    const res = await fetch(TURN_WORKER_URL, { method: 'POST' });
    if (!res.ok) return undefined;
    const data = await res.json() as { iceServers: RTCIceServer };
    return [data.iceServers];
  } catch {
    return undefined;
  }
}
