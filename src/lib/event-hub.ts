export type StreamAudience = {
  scope: "menu" | "kitchen" | "orders";
  outletId: string;
  userId?: string;
};
export type StreamSubscriber = {
  sessionId: string | null;
  send: (event: "message" | "heartbeat" | "unavailable", data: object) => void;
  close: () => void;
};
type Member = StreamSubscriber & { lastRevision?: string };
type Channel = {
  audience: StreamAudience;
  members: Set<Member>;
  timer: ReturnType<typeof setInterval>;
  busy: boolean;
};

// One timer and revision query serves all subscribers to an audience. Each
// application replica has its own pollers; this is not a cross-process broker.
export function createEventHub(dependencies: {
  revision: (audience: StreamAudience) => Promise<string>;
  authorize: (audience: StreamAudience, members: StreamSubscriber[]) => Promise<Set<string>>;
}, intervalMs = 3000) {
  const channels = new Map<string, Channel>();
  const keyOf = (audience: StreamAudience) => JSON.stringify([
    audience.scope, audience.scope === "orders" ? audience.userId : audience.outletId,
  ]);
  function remove(key: string, channel: Channel, member: Member) {
    channel.members.delete(member);
    if (channel.members.size === 0) {
      clearInterval(channel.timer);
      if (channels.get(key) === channel) channels.delete(key);
    }
  }
  async function tick(key: string, channel: Channel) {
    if (channel.busy || !channel.members.size) return;
    channel.busy = true;
    const members = [...channel.members];
    try {
      const allowed = channel.audience.scope === "menu" ? null
        : await dependencies.authorize(channel.audience, members);
      const active = members.filter((member) => {
        if (!channel.members.has(member)) return false;
        if (allowed && (!member.sessionId || !allowed.has(member.sessionId))) {
          remove(key, channel, member);
          member.close();
          return false;
        }
        return true;
      });
      if (!active.length) return;
      const revision = await dependencies.revision(channel.audience);
      for (const member of active) {
        if (!channel.members.has(member)) continue;
        try {
          const changed = member.lastRevision !== revision;
          member.send(changed ? "message" : "heartbeat", { revision, checkedAt: new Date().toISOString() });
          member.lastRevision = revision;
        } catch {
          remove(key, channel, member);
          member.close();
        }
      }
    } catch {
      for (const member of members) {
        if (!channel.members.has(member)) continue;
        try { member.send("unavailable", { retryInMs: intervalMs }); }
        catch { remove(key, channel, member); member.close(); }
      }
    } finally { channel.busy = false; }
  }
  return {
    subscribe(audience: StreamAudience, subscriber: StreamSubscriber) {
      const key = keyOf(audience);
      let channel = channels.get(key);
      const isNew = !channel;
      if (!channel) {
        channel = { audience, members: new Set(), busy: false, timer: undefined as unknown as ReturnType<typeof setInterval> };
        const created = channel;
        channel.timer = setInterval(() => void tick(key, created), intervalMs);
        channel.timer.unref?.();
        channels.set(key, channel);
      }
      const member: Member = { ...subscriber };
      channel.members.add(member);
      const subscribed = channel;
      // Coalesce the first batch; later arrivals join the next scheduled poll.
      if (isNew) queueMicrotask(() => void tick(key, subscribed));
      return () => remove(key, subscribed, member);
    },
    channelCount: () => channels.size,
  };
}
