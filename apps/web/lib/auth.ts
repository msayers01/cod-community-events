import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@cod/db";
import { env } from "./env";

function uniqueDisplayName(base: string): string {
  const cleaned = base.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20) || "player";
  return `${cleaned}_${Math.random().toString(36).slice(2, 6)}`;
}

const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
if (env.discord.id)
  socialProviders.discord = { clientId: env.discord.id, clientSecret: env.discord.secret };
if (env.twitch.id)
  socialProviders.twitch = { clientId: env.twitch.id, clientSecret: env.twitch.secret };

export const auth = betterAuth({
  baseURL: env.appUrl,
  secret: env.authSecret,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  socialProviders,
  // Sign-in is OAuth only. Email/password stays off so no passwords are stored.
  emailAndPassword: { enabled: false },
  account: {
    accountLinking: { enabled: true, trustedProviders: ["discord", "twitch"] },
  },
  user: {
    additionalFields: {
      displayName: { type: "string", required: false, input: false },
      activisionId: { type: "string", required: false, input: false },
      streamUrl: { type: "string", required: false, input: false },
      bio: { type: "string", required: false, input: false },
      status: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: { ...user, displayName: uniqueDisplayName(user.name ?? "player") },
        }),
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
