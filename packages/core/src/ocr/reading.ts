import { prisma, emit, type Prisma } from "@cod/db";
import {
  HARDPOINT_TABLE_COLUMNS,
  compareToSubmitted,
  linesFromWords,
  matchRows,
  panelIsConsistent,
  panelOwner,
  parsePanel,
  parseRows,
  parseScoreboard,
  planFill,
  type MatchedRow,
  type OcrWord,
  type PlayerCandidate,
  type ReadStats,
  type ScoreboardRow,
} from "./scoreboard.js";

/** A text-recognition engine. Tesseract today; swap in Cloud Vision or Textract behind this. */
export interface OcrResult {
  text: string;
  /** Mean confidence 0-100. */
  confidence: number;
  /** Positioned words, when the engine can provide them (needed for tables and the stats card). */
  words?: OcrWord[];
}

export interface OcrEngine {
  readonly name: string;
  /** `sparse` asks for scattered text (table cells, stat cards) rather than flowing paragraphs. */
  recognize(image: Buffer, opts?: { sparse?: boolean }): Promise<OcrResult>;
}

/**
 * A cropped, cleaned-up piece of the screenshot to read on its own. Variants with the same
 * `group` are alternative cleanups of the same area; the one that reads best wins.
 */
export interface ImageRegion {
  kind: "table" | "panel";
  group: string;
  image: Buffer;
}

/** Cuts a screenshot into regions that read better than the full frame. Needs an image library, so the worker supplies it. */
export type RegionCutter = (image: Buffer) => Promise<ImageRegion[]>;

export interface ReadingDeps {
  engine: OcrEngine;
  load: ScreenshotLoader;
  regions?: RegionCutter;
}

/** Table rows from the cropped regions: best variant per group, plus the stats card. */
async function readRegions(image: Buffer, deps: ReadingDeps) {
  const regions = (await deps.regions?.(image)) ?? [];
  const best = new Map<string, ScoreboardRow[]>();
  let panelWords: OcrWord[] = [];
  const confidences: number[] = [];
  for (const r of regions) {
    const res = await deps.engine.recognize(r.image, { sparse: true });
    confidences.push(res.confidence);
    const words = res.words ?? [];
    if (r.kind === "table") {
      const rows = parseRows(linesFromWords(words), HARDPOINT_TABLE_COLUMNS);
      if (rows.length > (best.get(r.group)?.length ?? 0)) best.set(r.group, rows);
    } else {
      // Keep the variant whose stats card parsed most completely.
      const score = (w: OcrWord[]) => {
        const p = parsePanel(w);
        return p ? [p.kills, p.deaths, p.ratio, p.idDigits].filter((v) => v !== null).length : -1;
      };
      if (score(words) > score(panelWords)) panelWords = words;
    }
  }
  return {
    rows: [...best.values()].flat(),
    panel: parsePanel(panelWords),
    confidence: confidences.length
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null,
  };
}

/** Fetches the screenshot bytes for a submission, or null when it can't be read automatically. */
export type ScreenshotLoader = (source: {
  screenshotKey: string | null;
  screenshotUrl: string | null;
}) => Promise<Buffer | null>;

export const MAX_READING_ATTEMPTS = 3;
const STALE_PROCESSING_MINUTES = 10;

/** Ask for a reading of this submission's screenshot. Idempotent. Call inside the submit transaction. */
export async function queueScreenshotReading(
  tx: Prisma.TransactionClient,
  submissionId: string,
): Promise<void> {
  await tx.screenshotReading.upsert({
    where: { submissionId },
    update: {},
    create: { submissionId },
  });
}

/** Claim readings for this worker. Safe to run from several workers at once. */
export async function claimPendingReadings(limit = 5): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "screenshot_reading"
    SET status = 'PROCESSING', "startedAt" = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "screenshot_reading"
      WHERE status = 'PENDING'
         OR (status = 'PROCESSING' AND "startedAt" < now() - make_interval(mins => ${STALE_PROCESSING_MINUTES}))
      ORDER BY "createdAt" ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
    ) RETURNING id`;
  return rows.map((r) => r.id);
}

const activisionName = (id: string | null) => (id ? id.replace(/#\d+$/, "") : null);

/**
 * Read one claimed screenshot. The reading is advisory: it never verifies a result.
 * It (1) records what the screenshot says, (2) highlights fields where it disagrees with
 * the submitted stats, and (3) pre-fills stats the submitter left blank, as unverified
 * rows that the confirmers see and can dispute.
 */
export async function processReading(
  readingId: string,
  deps: ReadingDeps,
): Promise<"completed" | "skipped" | "retry" | "failed" | "noop"> {
  const reading = await prisma.screenshotReading.findUnique({
    where: { id: readingId },
    include: {
      submission: {
        include: {
          stats: true,
          match: {
            include: {
              teamA: { include: { members: { include: { user: true } } } },
              teamB: { include: { members: { include: { user: true } } } },
              round: { select: { eventId: true } },
            },
          },
        },
      },
    },
  });
  if (!reading || reading.status !== "PROCESSING") return "noop";
  const { submission } = reading;

  try {
    const image = await deps.load({
      screenshotKey: submission.screenshotKey,
      screenshotUrl: submission.screenshotUrl,
    });
    if (!image) {
      await prisma.screenshotReading.update({
        where: { id: readingId },
        data: {
          status: "SKIPPED",
          error: "Screenshot is not stored in a place the reader can access",
          completedAt: new Date(),
        },
      });
      return "skipped";
    }

    const full = await deps.engine.recognize(image);
    let text = full.text;
    let confidence = full.confidence;
    const members = [...submission.match.teamA.members, ...submission.match.teamB.members];
    const candidates: PlayerCandidate[] = members.map((m) => ({
      playerId: m.userId,
      names: [m.user.displayName, activisionName(m.user.activisionId)].filter(
        (n): n is string => !!n,
      ),
    }));
    let matched: MatchedRow[] = matchRows(parseScoreboard(text).rows, candidates);

    // Stylised scoreboards often defeat a whole-frame read. Fall back to reading each table
    // and the stats card on its own, cleaned up, and fold in what they give us.
    let panelPlayer: { playerId: string; kills: number; deaths: number; repaired: boolean } | null =
      null;
    if (matched.length < 2 && deps.regions) {
      const parts = await readRegions(image, deps);
      if (parts.confidence !== null) confidence = parts.confidence;
      matched = matchRows(parts.rows, candidates);
      const panel = parts.panel;
      if (panel && panelIsConsistent(panel)) {
        const owner = panelOwner(
          panel,
          members.map((m, i) => ({ ...candidates[i]!, activisionId: m.user.activisionId })),
        );
        if (owner)
          panelPlayer = {
            playerId: owner,
            kills: panel.kills,
            deaths: panel.deaths,
            repaired: panel.repaired,
          };
      }
      if (panelPlayer) {
        const row = matched.find((r) => r.playerId === panelPlayer!.playerId);
        if (row) {
          row.stats.kills = panelPlayer.kills;
          row.stats.deaths = panelPlayer.deaths;
        } else
          matched.push({
            rawName: panel?.name ?? "stats card",
            stats: { kills: panelPlayer.kills, deaths: panelPlayer.deaths },
            playerId: panelPlayer.playerId,
            similarity: 1,
          });
      }
      text = `${text}\n[region reading: ${parts.rows.length} table rows${panelPlayer ? ", stats card" : ""}]`;
    }

    const manual = submission.stats.filter((s) => s.source === "MANUAL");
    const discrepancies = compareToSubmitted(
      matched,
      manual.map((s) => ({
        playerId: s.playerId,
        kills: s.kills,
        deaths: s.deaths,
        ...(s.plants !== null && { plants: s.plants }),
        ...(s.defuses !== null && { defuses: s.defuses }),
        ...(s.hillTimeSeconds !== null && { hillTimeSeconds: s.hillTimeSeconds }),
      })),
    );
    let fill: ({ playerId: string } & ReadStats)[] =
      manual.length === 0
        ? planFill({ rows: matched, participants: members.length, confidence })
        : [];
    // The stats card is a single player's self-consistent numbers, identified by their id.
    // Enough to pre-fill that one player when nothing else could be read confidently.
    if (manual.length === 0 && fill.length === 0 && panelPlayer && confidence >= 60) {
      const row = matched.find((r) => r.playerId === panelPlayer!.playerId);
      fill = [
        {
          playerId: panelPlayer.playerId,
          kills: panelPlayer.kills,
          deaths: panelPlayer.deaths,
          ...(row?.stats.hillTimeSeconds !== undefined && {
            hillTimeSeconds: row.stats.hillTimeSeconds,
          }),
        },
      ];
    }

    await prisma.$transaction(async (tx) => {
      // Only fill while the result is still open for confirmation; never change verified data.
      const fresh = await tx.resultSubmission.findUniqueOrThrow({
        where: { id: submission.id },
        select: { status: true },
      });
      const filled = fill.length > 0 && fresh.status === "PENDING";
      if (filled) {
        await tx.playerMatchStat.createMany({
          data: fill.map((f) => ({
            matchId: submission.matchId,
            submissionId: submission.id,
            playerId: f.playerId,
            kills: f.kills ?? 0,
            deaths: f.deaths ?? 0,
            plants: f.plants,
            defuses: f.defuses,
            hillTimeSeconds: f.hillTimeSeconds,
            source: "OCR" as const,
          })),
          skipDuplicates: true,
        });
      }
      await tx.screenshotReading.update({
        where: { id: readingId },
        data: {
          status: "COMPLETED",
          provider: deps.engine.name,
          rawText: text,
          confidence,
          rows: matched as unknown as Prisma.InputJsonValue,
          discrepancies: discrepancies as unknown as Prisma.InputJsonValue,
          filledStats: filled,
          error: null,
          completedAt: new Date(),
        },
      });
      await emit(tx, {
        type: "ScreenshotRead",
        submissionId: submission.id,
        matchId: submission.matchId,
        eventId: submission.match.round.eventId,
      });
    });
    return "completed";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const giveUp = reading.attempts >= MAX_READING_ATTEMPTS;
    await prisma.screenshotReading.update({
      where: { id: readingId },
      data: {
        status: giveUp ? "FAILED" : "PENDING",
        error: message.slice(0, 500),
        completedAt: giveUp ? new Date() : null,
      },
    });
    return giveUp ? "failed" : "retry";
  }
}

/** Claim and process a batch. Returns how many readings were attempted. */
export async function processPendingReadings(deps: ReadingDeps, limit = 3): Promise<number> {
  const ids = await claimPendingReadings(limit);
  for (const id of ids) await processReading(id, deps);
  return ids.length;
}
