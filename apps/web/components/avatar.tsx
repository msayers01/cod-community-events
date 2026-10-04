/** Letters for the fallback: skips clan tags like [ABC] and punctuation. */
export function initialsOf(displayName: string): string {
  // Clan tags like [ABC] are skipped. Scanned, not a regex: those backtrack badly on "[[[[…".
  let withoutTags = "";
  for (let i = 0; i < displayName.length;) {
    if (displayName[i] === "[") {
      const close = displayName.indexOf("]", i + 1);
      if (close === -1) {
        withoutTags += displayName.slice(i);
        break;
      }
      withoutTags += " ";
      i = close + 1;
    } else withoutTags += displayName[i++];
  }
  const words = withoutTags.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : words[0]!.slice(0, 2)).toUpperCase();
}

function hue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** A user's picture, or a colored initials badge when they haven't set one. Works in server and client components. */
export function Avatar({
  user,
  size = 32,
  className = "",
}: {
  user: { id: string; displayName: string; avatarUpdatedAt?: Date | string | null };
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (user.avatarUpdatedAt) {
    const v = new Date(user.avatarUpdatedAt).getTime();
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny pre-sized WebP from our own route
      <img
        src={`/api/avatars/${user.id}?v=${v}`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        style={style}
        className={`shrink-0 rounded-full border border-line bg-bg object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        ...style,
        fontSize: Math.max(10, Math.round(size * 0.4)),
        backgroundColor: `hsl(${hue(user.id)} 45% 32%)`,
      }}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${className}`}
    >
      {initialsOf(user.displayName)}
    </span>
  );
}
