/**
 * Compile-time check that @cod/shared enums match the Prisma enums.
 * If either side drifts, this file fails to typecheck.
 */
import type * as S from "@cod/shared";
import type {
  AppealStatus,
  AppealTarget,
  BadgeKind,
  BlacklistStatus,
  LeaderboardPeriod,
  RandomizationMode,
  ReadingStatus,
  StatSource,
  ThrowFlagStatus,
  ThrowSignal,
  ConfirmationResponse,
  MatchStatus,
  SubmissionStatus,
  AccountStatus,
  EntryType,
  EventFormat,
  EventStatus,
  GameMode,
  HosterTier,
  PayoutResponse,
  Platform,
  Region,
  RegistrationStatus,
  ReportCategory,
  ReportStatus,
  RoundStatus,
  SignupSource,
  StaffRoleKind,
} from "../generated/prisma/enums.js";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type _checks = [
  Assert<Same<S.AccountStatus, AccountStatus>>,
  Assert<Same<S.StaffRole, StaffRoleKind>>,
  Assert<Same<S.HosterTier, HosterTier>>,
  Assert<Same<S.GameMode, GameMode>>,
  Assert<Same<S.EventFormat, EventFormat>>,
  Assert<Same<S.EntryType, EntryType>>,
  Assert<Same<S.Platform, Platform>>,
  Assert<Same<S.Region, Region>>,
  Assert<Same<S.EventStatus, EventStatus>>,
  Assert<Same<S.RegistrationStatus, RegistrationStatus>>,
  Assert<Same<S.SignupSource, SignupSource>>,
  Assert<Same<S.RoundStatus, RoundStatus>>,
  Assert<Same<S.ReportCategory, ReportCategory>>,
  Assert<Same<S.ReportStatus, ReportStatus>>,
  Assert<Same<S.PayoutResponse, PayoutResponse>>,
  Assert<Same<S.MatchStatus, MatchStatus>>,
  Assert<Same<S.SubmissionStatus, SubmissionStatus>>,
  Assert<Same<S.ConfirmationResponse, ConfirmationResponse>>,
  Assert<Same<S.BadgeKind, BadgeKind>>,
  Assert<Same<S.BlacklistStatus, BlacklistStatus>>,
  Assert<Same<S.AppealTarget, AppealTarget>>,
  Assert<Same<S.AppealStatus, AppealStatus>>,
  Assert<Same<S.RandomizationMode, RandomizationMode>>,
  Assert<Same<S.StatSource, StatSource>>,
  Assert<Same<S.ReadingStatus, ReadingStatus>>,
  Assert<Same<S.ThrowSignal, ThrowSignal>>,
  Assert<Same<S.ThrowFlagStatus, ThrowFlagStatus>>,
  Assert<Same<S.LeaderboardPeriod, LeaderboardPeriod>>,
];
