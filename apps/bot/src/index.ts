import { loadRootEnv } from "@cod/db";
loadRootEnv();
import { initSentry } from "./sentry.js";
initSentry("bot");
import {
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type TextChannel,
} from "discord.js";
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
  // Stay alive so `pnpm dev` keeps running; nothing is posted without a token.
  setInterval(() => undefined, 3_600_000);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/**
 * Slash commands for community server admins:
 *   /cod-events subscribe [mode] [region]   post new events to this channel
 *   /cod-events unsubscribe                 stop posting here
 *   /cod-events upcoming                    list the next open events
 */
const commands = [
  new SlashCommandBuilder()
    .setName("cod-events")
    .setDescription("Community switcheroo listings")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sc) =>
      sc
        .setName("subscribe")
        .setDescription("Post new events to this channel")
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("Only this mode")
            .addChoices(
              { name: "Search & Destroy", value: "SND" },
              { name: "Hardpoint", value: "HARDPOINT" },
            ),
        )
        .addStringOption((o) =>
          o
            .setName("region")
            .setDescription("Only this region")
            .addChoices(
              { name: "NA East", value: "NA_EAST" },
              { name: "NA West", value: "NA_WEST" },
              { name: "EU", value: "EU" },
              { name: "OCE", value: "OCE" },
            ),
        ),
    )
    .addSubcommand((sc) =>
      sc.setName("unsubscribe").setDescription("Stop posting events to this channel"),
    )
    .addSubcommand((sc) => sc.setName("upcoming").setDescription("Show the next open events")),
].map((c) => c.toJSON());

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "cod-events") return;
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === "subscribe") {
      if (!interaction.guildId || interaction.channel?.type !== ChannelType.GuildText) {
        await interaction.reply({
          content: "Use this in a text channel of a server.",
          ephemeral: true,
        });
        return;
      }
      const filters = {
        mode: interaction.options.getString("mode") ?? undefined,
        region: interaction.options.getString("region") ?? undefined,
      };
      // configuredById must reference a site user; the bot stores the Discord user id in filters instead.
      const founder = await prisma.staffRole.findFirst({
        where: { role: "FOUNDER" },
        select: { userId: true },
      });
      if (!founder) {
        await interaction.reply({ content: "The site is not set up yet.", ephemeral: true });
        return;
      }
      await prisma.discordServerConfig.upsert({
        where: {
          guildId_channelId: { guildId: interaction.guildId, channelId: interaction.channelId },
        },
        update: { filters: { ...filters, configuredByDiscordId: interaction.user.id } },
        create: {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          filters: { ...filters, configuredByDiscordId: interaction.user.id },
          configuredById: founder.userId,
        },
      });
      await interaction.reply({
        content: `Subscribed. New ${filters.mode ?? "SnD/HP"} events${filters.region ? ` in ${filters.region.replace("_", " ")}` : ""} will be posted here.`,
        ephemeral: true,
      });
    } else if (sub === "unsubscribe") {
      if (!interaction.guildId) return;
      await prisma.discordServerConfig.deleteMany({
        where: { guildId: interaction.guildId, channelId: interaction.channelId },
      });
      await interaction.reply({
        content: "Unsubscribed. No more event posts here.",
        ephemeral: true,
      });
    } else if (sub === "upcoming") {
      const events = await prisma.event.findMany({
        where: { status: { in: ["OPEN", "CHECK_IN"] }, startsAt: { gte: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 5,
        include: {
          hoster: { include: { user: true } },
          _count: {
            select: {
              registrations: { where: { status: { in: ["CONFIRMED", "CHECKED_IN", "IN_POOL"] } } },
            },
          },
        },
      });
      if (events.length === 0) {
        await interaction.reply({ content: "No open events right now.", ephemeral: true });
        return;
      }
      const lines = events.map(
        (e) =>
          `• **${e.title}** by ${e.hoster.user.displayName} · ${e.teamSize}v${e.teamSize} ${e.mode} · <t:${Math.floor(e.startsAt.getTime() / 1000)}:R> · ${e._count.registrations}/${e.playerCap} paid · ${appUrl}/events/${e.slug}`,
      );
      await interaction.reply({ content: lines.join("\n"), ephemeral: true });
    }
  } catch (err) {
    console.error("[bot] command failed", err);
    if (!interaction.replied)
      await interaction
        .reply({ content: "Something went wrong.", ephemeral: true })
        .catch(() => undefined);
  }
});

client.once("clientReady", async () => {
  console.log(`[bot] logged in as ${client.user?.tag}`);
  try {
    const rest = new REST().setToken(token!);
    await rest.put(Routes.applicationCommands(client.user!.id), { body: commands });
    console.log("[bot] slash commands registered");
  } catch (err) {
    console.error("[bot] could not register commands", err);
  }
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

if (token) client.login(token);
