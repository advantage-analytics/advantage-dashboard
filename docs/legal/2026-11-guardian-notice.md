# Guardian notice: Guardian Terms 1.2 (draft, not sent)

Guardian Terms §8 requires emailing every guardian account **before** the change
takes effect. Send this, wait the notice period you choose (suggest 14 days), then
apply the `20261107180000_legal_versions_splitstep_training.sql` migration and deploy.
Guardians then agree again on the "Our terms have changed" screen. A guardian
who doesn't agree can't continue, so their junior's new video is never sent
without fresh consent.

Recipients: `users` where `role = 'parent'` (exclude `@example.com` test accounts).

---

**Subject:** A change to how match video is used on Advantage

Hi {first_name},

You manage {player_first_name}'s Advantage account, so we want to tell you about a
change to our Guardian Terms before it takes effect on {effective_date}.

**What's changing.** We analyze match video with a video analysis provider. That
provider uses the video it receives to train and improve its analysis models,
including video of players under 18. Until now our terms said junior video was
never used this way. From {effective_date} it will be.

**What stays the same.**

- Neither we nor the provider use facial recognition or try to identify who a player is.
  The analysis tracks where players and the ball are on the court.
- Video is never used for advertising or marketing, and the provider does not sell it.
- Only you decide what is uploaded and who it's shared with.
- You can delete a video, a match or the whole account at any time. We'll ask the provider
  to delete its copy too.

**What you need to do.** The next time you open Advantage you'll be asked to agree to
the updated terms. If you'd rather not, don't upload new video, and reply to this email
if you'd like us to delete {player_first_name}'s account and video.

Read the updated Guardian Terms: https://advantage-analytics.com/legal/guardian-terms

Questions? Just reply.

Cj, Advantage
