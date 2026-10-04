import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/index.js";

async function main() {
  const founder = await prisma.user.upsert({
    where: { email: "founder@example.com" },
    update: {},
    create: {
      name: "Founder",
      email: "founder@example.com",
      displayName: "Founder",
      activisionId: "Founder#1234567",
      staffRole: { create: { role: "FOUNDER" } },
    },
  });

  for (const [name, role] of [
    ["Moderator", "MODERATOR"],
    ["TrialMod", "TRIAL_MODERATOR"],
  ] as const) {
    await prisma.user.upsert({
      where: { email: `${name.toLowerCase()}@example.com` },
      update: {},
      create: {
        name,
        email: `${name.toLowerCase()}@example.com`,
        displayName: name,
        staffRole: { create: { role } },
      },
    });
  }

  const hosterUser = await prisma.user.upsert({
    where: { email: "hoster@example.com" },
    update: {},
    create: {
      name: "Demo Hoster",
      email: "hoster@example.com",
      displayName: "DemoHoster",
      activisionId: "DemoHoster#7654321",
      streamUrl: "https://twitch.tv/demohoster",
      hosterProfile: {
        create: { tier: "VERIFIED", foundingHoster: true, twitterHandle: "demohoster" },
      },
    },
  });

  const players = [];
  for (let i = 1; i <= 10; i++) {
    players.push(
      await prisma.user.upsert({
        where: { email: `player${i}@example.com` },
        update: {},
        create: {
          name: `Player ${i}`,
          email: `player${i}@example.com`,
          displayName: `Player${i}`,
          activisionId: `Player${i}#${1000000 + i}`,
        },
      }),
    );
  }

  const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const event = await prisma.event.upsert({
    where: { slug: "friday-night-snd-switcheroo" },
    update: {},
    create: {
      hosterId: hosterUser.id,
      title: "Friday Night SnD Switcheroo",
      slug: "friday-night-snd-switcheroo",
      description:
        "4v4 SnD switcheroo. $10 entry, winner takes 70%, runner-up 30%. Spins live on Twitch.",
      mode: "SND",
      format: "SWITCHEROO",
      teamSize: 4,
      roundCount: 3,
      playerCap: 16,
      entryFeeCents: 1000,
      payoutSplit: [
        { place: 1, percent: 70 },
        { place: 2, percent: 30 },
      ],
      region: "NA_EAST",
      platform: "CROSSPLAY",
      rules: {
        mapPool: ["Hacienda", "Red Card", "Vault"],
        bannedItems: [],
        streamingRequired: false,
        monicamOnRequest: true,
        notes: "",
      },
      entryType: "OPEN",
      startsAt,
      checkInOpensAt: new Date(startsAt.getTime() - 60 * 60 * 1000),
      checkInClosesAt: new Date(startsAt.getTime() - 10 * 60 * 1000),
      status: "OPEN",
      joinCode: "FRIDAY1",
      overlayKey: randomBytes(24).toString("base64url"),
      publishedAt: new Date(),
    },
  });

  for (const [i, p] of players.entries()) {
    const paid = i < 6;
    await prisma.registration.upsert({
      where: { eventId_playerId: { eventId: event.id, playerId: p.id } },
      update: {},
      create: {
        eventId: event.id,
        playerId: p.id,
        status: paid ? "CONFIRMED" : "WAITLISTED",
        waitlistPosition: paid ? null : i - 5,
        markedPaidById: paid ? hosterUser.id : null,
        markedPaidAt: paid ? new Date() : null,
      },
    });
  }

  console.log(
    `Seeded: founder ${founder.displayName}, hoster ${hosterUser.displayName}, event /events/${event.slug}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
