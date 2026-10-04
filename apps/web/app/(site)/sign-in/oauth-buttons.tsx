"use client";
import { signIn } from "@/lib/auth-client";

export function OAuthButtons({ discord, twitch }: { discord: boolean; twitch: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <button
        className="btn"
        disabled={!discord}
        onClick={() => signIn.social({ provider: "discord", callbackURL: "/" })}
      >
        Continue with Discord
      </button>
      <button
        className="btn"
        disabled={!twitch}
        onClick={() => signIn.social({ provider: "twitch", callbackURL: "/" })}
      >
        Continue with Twitch
      </button>
    </div>
  );
}
