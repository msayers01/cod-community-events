import { loadRootEnv } from "@cod/db";
loadRootEnv();
import { Client, EmbedBuilder, GatewayIntentBits, type TextChannel } from "discord.js";
import { prisma } from "@cod/db";

/**
 * Discord bot. Phase 1: posts newly published events to configured channels.
 * It tails the outbox for EventPublished rows the worker has marked DONE and
 * tracks its own cursor so it never double-posts.
 */
const token = process.env.DISCORD_BOT_TOKEN;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

if (!token) {
  console.log("[bot] DISCORD_BOT_TOKEN not set; bot idle. Set it to enable posting.");
  process.exit(0);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async () => {
  console.log(`[bot] logged in as ${client.user?.tag}`);
  let since = new Date();
  setInterval(async () => {
    const rows = await prisma.outboxEvent.findMany({
      where: { type: "EventPublished", status: "DONE", processedAt: { gt: since } },
      orderBy: { processedAt: "asc" },
    });
    for (const row of rows) {
      since = row.processedAt ?? since;
      const { eventId } = row.payload as { eventId: string };
      await postEvent(eventId).catch((e) => console.error("[bot] post failed", e));
    }
  }, 10_000);
});

async function postEvent(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { hoster: { include: { user: true } } },
  });
  if (!event || event.status !== "OPEN") return;
  const configs = await prisma.discordServerConfig.findMany();
  const embed = new EmbedBuilder()
    .setTitle(event.title)
    .setURL(`${appUrl}/events/${event.slug}`)
    .setDescription(event.description.slice(0, 300) || null)
    .addFields(
      {
        name: "Hoster",
        value: `${event.hoster.user.displayName} (${event.hoster.tier.toLowerCase()})`,
        inline: true,
      },
      {
        name: "Format",
        value: `${event.teamSize}v${event.teamSize} ${event.mode} ${event.format.toLowerCase()}`,
        inline: true,
      },
      {
        name: "Starts",
        value: `<t:${Math.floor(event.startsAt.getTime() / 1000)}:F>`,
        inline: false,
      },
      {
        name: "Entry",
        value: event.entryFeeCents ? `$${(event.entryFeeCents / 100).toFixed(2)}` : "Free",
        inline: true,
      },
      { name: "Spots", value: String(event.playerCap), inline: true },
    )
    .setColor(0xf2a93b);

  for (const cfg of configs) {
    const filters = cfg.filters as { mode?: string; region?: string };
    if (filters.mode && filters.mode !== event.mode) continue;
    if (filters.region && filters.region !== event.region) continue;
    const channel = await client.channels.fetch(cfg.channelId).catch(() => null);
    if (channel?.isTextBased()) await (channel as TextChannel).send({ embeds: [embed] });
  }
}

client.login(token);
