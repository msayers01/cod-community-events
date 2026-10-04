# CoD Community Tournament Platform — Planning Document

_Working title: TBD_
_Status: Concept and planning (no development started)_

---

## 1. Overview

### The problem

Community-hosted Call of Duty tournaments, especially SnD and Hardpoint switcheroos, currently rely almost entirely on Twitter/X for promotion and on DMs, comments, and spreadsheets for organization. This creates two main problems:

- **Discovery:** Hosters with a large following fill their events easily, while lesser-known hosters struggle to get enough sign-ups regardless of how well they run their events.
- **Trust:** Players have no reliable way to check whether a hoster pays out, runs fair spins, or has a history of problems. Likewise, hosters have no shared way to identify players who scam, cheat, throw matches, or repeatedly no-show.

### The solution

A website where hosters register, post their tournaments, and run them with built-in tools, while the platform tracks reputation for both hosters and players. The platform provides the infrastructure; the community does the hosting.

### Positioning

The platform focuses **exclusively on community-hosted SnD/HP switcheroos and tournaments**. It deliberately avoids team wagers, ladders, and platform-run events, which are already covered by established sites such as CMG, GameBattles, and UMG. Competing with those platforms is not a goal, at least for now.

The site is trust-first: the aim is to become _the place where legitimate hosters live_, not just a listing board.

---

## 2. Users

| User                    | What they want                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Hosters**             | More sign-ups, credibility, and less admin work during events                                               |
| **Players**             | Easy discovery of events, confidence that hosters are legit, and fair lobbies free of cheaters and throwers |
| **Staff (mods/admins)** | Tools to review reports, settle disputes, verify hosters, and maintain the blacklist                        |

---

## 3. How Switcheroos Currently Run

Understanding the existing flow is essential, because the platform should support it rather than replace it.

1. The hoster promotes the tournament on Twitter/X.
2. Players sign up by DM or comment.
3. Paying the entry fee secures a spot. Unpaid sign-ups are waitlisted until they pay, up until the wheel spins begin.
4. The hoster goes live on Twitch and spins the wheel to randomize teams. Viewers can also join through chat.
5. During matches, players must stream or use monicam on request as an anti-cheat measure.
6. Individual stats don't affect results in the current format.

**Key insight:** The Twitch wheel spin is part of the event's appeal. It is entertainment and content for the hoster, so the platform should power that moment rather than remove it.

---

## 4. Core Features

### 4.1 Event creation and listings

Hosters create events specifying mode (SnD or HP), format (switcheroo or standard tournament), team size, number of rounds or maps, player cap, entry fee, payout split, region/platform, and rules (map pool, banned items, streaming/monicam requirements).

- Saved templates let regular hosters set up new events quickly.
- Listings show date and time with automatic timezone conversion, live sign-up counts, and spots remaining.
- Players can filter events and browse "starting soon" views, which helps smaller hosters get seen.
- Standard (non-switcheroo) community tournaments are supported as **listings only** at first: sign-ups, details, and payout confirmation. Hosters continue to use their own bracket tools. Bracket management may be added later if there is demand.

### 4.2 Sign-ups, payment tracking, and waitlist

- Players sign up through the site instead of DMs or comments.
- The hoster manually marks players as paid. **The site never handles money.**
- Unpaid players are waitlisted automatically, and the waitlist promotes the next player when someone drops or fails to pay.
- Hosters get a short join link to drop in Twitch chat, plus a quick-add option on their dashboard for late entries during the stream.
- Blacklisted players are automatically flagged, and hosters can see each sign-up's history (events played, no-shows, reports).

### 4.3 Check-in

Players check in during a window before the event starts. No-shows are recorded on their profile.

### 4.4 Wheel spin overlay

- The site generates a wheel from confirmed, paid players.
- Hosters add it to OBS as a browser source so it appears on stream like any other overlay.
- Every spin is logged on the site with a timestamp and result, so players can verify afterward that spins weren't rigged.
- The hoster keeps the show; players get proof of fairness. The wheel also acts as recurring branding for the site on every stream that uses it.
- Default randomization is fully random with a public log. Optional settings (such as skill-balanced shuffling or avoiding repeat teammates) can be considered later.

### 4.5 Streaming and monicam support

- Player profiles store Twitch or other streaming links.
- Event rules state whether streaming or monicam is required.
- During an event, the site lists each player's stream link so hosters and opponents can check quickly.
- VOD links with timestamps can be attached to disputes and reports as evidence.

### 4.6 Payout confirmation

After an event, winners are prompted to confirm whether they were paid within a set window. This is the backbone of hoster reputation because it is objective data. A profile showing "34 events, 34 confirmed payouts" is worth more than any review.

### 4.7 Hoster profiles and reviews

- Hosters link their Twitter/X, Discord, Twitch, and Activision ID.
- Profiles show completed events, confirmed payouts, tier badge, and reviews.
- Only players who actually participated in an event can review it (organization, communication, fairness), which prevents brigading.

### 4.8 Player profiles

Because switcheroo players sign up solo, the individual player is the core unit of the platform. Profiles show linked accounts, event history, verified stats, teammate rating, no-show count, and badges.

---

## 5. Performance Tracking and Match Verification

### 5.1 Goals

Stats are not used to decide switcheroo results. They serve three purposes:

1. **Teammate reputation** — helping good, reliable players build a visible track record.
2. **Fairer events** — giving hosters options to keep lobbies enjoyable.
3. **Catching throwers** — identifying players who deliberately lose because they are betting against themselves on the side.

### 5.2 Data source

All stats are submitted through the platform rather than pulled from any external source.

- **Starting point:** Scoreboard screenshots uploaded after each match, with core stats entered alongside (kills, deaths, plants/defuses for SnD, hill time for HP, plus win/loss).
- **Later:** Automatic text recognition to read stats from screenshots and reduce manual entry.

### 5.3 Submission and verification flow

Results can be submitted by **both players and the hoster**, but nothing counts until verified.

1. Any player in the match, or the hoster, submits the result with a **required scoreboard screenshot**, which acts as the source of truth.
2. Other players in the match receive a prompt to confirm or dispute. Ideally at least one player from each team confirms, since opponents have no reason to inflate someone else's stats.
3. If enough players confirm and nobody disputes within a set window (e.g., 24 hours), the match is **automatically verified**.
4. **Disputed** or unconfirmed matches go into a manual review queue.

**Who reviews:** Hosters review disputes from their own events first, since they watched and have the VOD. Site mods handle escalations, disputes involving the hoster, and anything touching the blacklist.

**Other rules:**

- Unverified stats do not count toward profiles (or are shown separately as unverified), so fabricating results gains nothing.
- Disputes require a short reason and optionally a corrected value.
- Confirming should take one tap: a notification showing the screenshot and submitted stats side by side, with confirm and dispute buttons.
- Consistent confirmers may earn a small reputation boost.
- Mods occasionally spot-check verified matches against their screenshots.
- Submitting falsified results, or knowingly confirming them, carries a reputation penalty, escalating to a blacklist entry for repeat offenses.
- Hosters should not have to review stats mid-event. Confirmation and review happen after the stream.

### 5.4 Teammate ratings

Stats alone don't show whether someone is a good teammate. Short post-match ratings from actual teammates ("would play with again," communication, effort) round out the picture. Ratings are aggregated over many matches so a single salty loss doesn't damage someone's profile.

### 5.5 Event entry options for hosters

Part of switcheroo's appeal is that anyone can enter, so skill gating is a hoster choice, not a site-wide rule. Hosters can run:

- **Open events** — anyone can enter.
- **Requirement-based events** — e.g., a minimum number of completed events with no reports.
- **Invite-only events.**

### 5.6 Throw detection

Once enough match history exists, the system can flag:

- Matches where a player performs far below their own baseline.
- Patterns such as unusually frequent losses in specific events or with specific players.

**Flags go to mods for review alongside VODs and teammate reports. They never trigger automatic punishment.** Anyone can have a bad game, and SnD is high-variance. Repeated anomalies combined with reports and footage build a case.

Detection criteria stay private so throwers can't learn to avoid them; the appeals process stays public.

---

## 6. Blacklist and Reports

A unified blacklist covering both hosters and players is one of the platform's most valuable features and its most sensitive one. It must be seen as fair, or it discredits the whole site.

- **Evidence required:** Reports need screenshots, clips/VODs, or payment records.
- **Review before publishing:** Nothing goes public without staff review.
- **Right to respond:** The accused party can respond before an entry goes live.
- **Clear categories:** Non-payment/scamming, cheating, throwing, repeated no-shows, harassment, falsified results. Each carries different weight.
- **Expiry:** Lesser offenses can expire after a set period.
- **Appeals:** A clear, public appeals process.
- **Careful wording:** Entries are phrased as verified reports (e.g., "Verified report: unpaid winnings from [event], evidence reviewed") rather than blanket labels, to reduce defamation risk. _(Consult a lawyer before launch.)_
- **Attribution:** Entries publicly state "reviewed and approved by staff." The specific mods involved are recorded internally only.

---

## 7. Roles, Permissions, and Badges

Roles have two parts: **permissions** (what someone can do) and **badges** (what others see). Some roles are purely cosmetic.

### 7.1 Hosters (limited control over their own events)

Can: mark players as paid, remove or replace players before the event starts, settle disputes within their own matches, verify results, record no-shows, and file reports.

Cannot: act outside their own events or blacklist anyone directly (they can only report).

### 7.2 Trial Moderators

Can: review disputed matches, review reports and gather evidence, remove inappropriate listings/profile content/reviews, and issue formal warnings.

Can recommend, but not approve: blacklist entries and suspensions.

### 7.3 Moderators

Everything trial mods can do, plus: temporary suspensions, approving blacklist entries (with a second mod signing off), handling appeals for cases they weren't involved in, verifying hosters and changing hoster tiers, and intervening in live events (pausing an event, posting a notice, flagging it) if a hoster disappears or is caught rigging spins.

### 7.4 Admins

Permanent bans, reversing other staff decisions, final rulings on appeals, adding/removing mods and changing their tier, editing site rules and policies, and handling legal or data requests (such as data deletion).

### 7.5 Rules for all staff

- **Recusal:** Staff cannot act on cases involving themselves, their friends, or events they hosted or played in.
- **Two-person approval:** Required for anything public and lasting, such as blacklist entries and permanent bans.
- **Complete action log:** Records who did what, when, and why. Staff cannot edit or delete entries.
- **Required reasons:** Every action needs a stated reason, enabling appeals and consistency.
- **Limited data access:** Staff see what they need for a case (linked accounts, match history) but not private details like email addresses without a specific reason.
- **Internal notes:** Staff can leave notes on users visible only to staff (e.g., "warned about no-shows in March") to spot patterns without making minor issues public.

### 7.6 Public badges

| Badge               | How it's earned                                             | Notes                                      |
| ------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| **Founder**         | Site owner                                                  | Distinct from Admin                        |
| **Admin**           | Appointed                                                   |                                            |
| **Moderator**       | Appointed after screening                                   | Trial and full mods share one public badge |
| **New Hoster**      | Registered, few or no completed events                      | Automatic                                  |
| **Verified Hoster** | Track record of completed events with confirmed payouts     | Automatic, mods can grant/revoke           |
| **Trusted Hoster**  | Long-standing, spotless record                              | Name TBD                                   |
| **Founding Hoster** | Early adopters who helped launch the site                   | Permanent; recruitment incentive           |
| **Verified Player** | Linked accounts and a set number of clean, completed events | Useful filter for hosters                  |
| **Supporter**       | Optional paid tier (future)                                 | Purely cosmetic, never implies trust       |

Staff who also host or play show both badges (e.g., Moderator + Verified Hoster). Recusal rules still apply.

### 7.7 Protecting staff

- Mod and admin badges are visible, but individual decisions are attributed only to "staff."
- Harassing staff over moderation decisions is an enforceable rule with real consequences.
- Appeals are the only official channel for disputing decisions.
- Mods may temporarily hide their badge if targeted; admins can still see their status.

### 7.8 Moderator recruitment

The owner will personally screen moderators closer to launch. New mods start as trial moderators and earn additional permissions over time.

---

## 8. Integrations and Growth

### Working with existing channels

The platform should feed into Twitter/X and Discord rather than try to replace them:

- One-click sharing of tournament cards to Twitter/X.
- A Discord bot that posts new tournaments to community servers.
- Possibly an official X account that auto-posts listings.
- The wheel overlay on Twitch streams as ongoing visibility.

### Solving the cold start

A listing site with no listings won't attract anyone. Before launch:

- Recruit a handful of respected mid-size hosters and offer the Founding Hoster badge.
- Lead with the switcheroo tooling, since convenience is what gets hosters to switch.
- Target smaller hosters as natural early adopters, since they feel the discovery problem most.
- Large hosters may not need the platform at first, but their presence would add legitimacy.

### Long-term hook

Cross-event leaderboards (e.g., monthly switcheroo standings across all hosters) give players a reason to keep entering events on the platform. No individual hoster can offer this on their own.

---

## 9. Risks and Considerations

- **Money and wagering laws:** Paid-entry events with cash prizes may fall under gambling or skill-gaming laws depending on country and US state, and Activision's terms of service may also apply. The site will not handle money; hosters collect and pay out through their own methods. Escrow or payment processing is a possible far-future feature only, given the legal, financial, and fraud liability. _(Seek legal advice.)_
- **Defamation risk:** Public blacklist entries must be evidence-based and carefully worded. _(Seek legal advice.)_
- **Moderation workload:** The verification system is designed so that most matches verify automatically and staff only review real disputes.
- **Community toxicity:** Staff protections, private attribution, and a formal appeals process reduce the risk of harassment.
- **Scope creep:** Expanding into team wagers or ladders would put the platform in direct competition with established sites. Stay focused.

---

## 10. Roadmap

### Phase 1 — MVP

- Hoster and player accounts with Activision ID, Discord, Twitter/X, and Twitch linking
- Event creation, templates, and listings (switcheroos plus standard tournaments as listings only)
- Sign-ups with hoster-marked payment status and automatic waitlist
- Twitch chat join links and quick-add for late entries
- Check-in and no-show tracking
- Wheel spin OBS overlay with public spin logs
- Payout confirmation
- Basic hoster and player profiles with event history
- Mod-reviewed report system
- Staff roles, permissions, and action logging

### Phase 2

- Screenshot-based match result submission with player/hoster verification
- Core stat tracking
- Teammate ratings
- Public blacklist with right to respond and appeals
- Participant-only hoster reviews
- Hoster tiers and badges
- Discord bot and social sharing
- Event entry options (open, requirement-based, invite-only)

### Phase 3

- Throw detection and anomaly flagging
- Automatic stat reading from screenshots
- Verified Player badge
- Cross-event leaderboards and seasonal standings
- Optional randomization settings (skill-balanced, no repeat teammates)
- Optional featured listings and Supporter tier
- Possible bracket management for standard tournaments

---

## 11. Monetization (Later)

The core platform stays free; charging for basic listings early would hurt adoption. Possible future revenue:

- Featured or boosted event listings
- Custom branding options for hosters
- Sponsorships
- An optional, purely cosmetic Supporter subscription

---

## 12. Open Questions

- Final name and branding
- Exact verification window and confirmation thresholds for match results
- Criteria for each hoster tier
- Expiry periods for each blacklist category
- Whether staff are shown as plain "staff" or with anonymous staff numbers internally/publicly
- Legal review of wagering and defamation exposure
