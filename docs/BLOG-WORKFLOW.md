# Experiment posts: from the platform to the blog, Telegram and the newsletter

Status: the platform side (steps 1 and 2) is built. The hand-off (step 3) and the n8n side (steps 4 and 5) are a proposal, waiting for the decisions at the end.

## Principles

- The platform owns the **facts**: the numbers, the dates, the member's own notes. It never invents a figure and the numbers never pass through an AI.
- n8n owns **distribution and voice**: it polishes the Hebrew, creates the drafts in each channel and tells the owner where they are.
- A person approves at both ends: the member decides when a post leaves the platform, and the owner presses publish in Telegram or Kit. **Nothing publishes itself**, and every channel gets a *draft*.

## The flow

```
 member writes notes + conclusion        (built)   /member/experiments/[id]
        │
        ▼
 1. Draft package                        (built)   /member/experiments/[id]/post
    ExperimentPostPackage v2: short summary (tldr), headline options, blog Markdown + escaped HTML,
    Telegram text, newsletter subject + preview + Markdown + HTML, aggregates (incl. nights
    above/within/below the usual range), warnings. Today the member copies the text by hand
    (formatted copy for blog/Kit editors, or Markdown).
        │
        ▼  "שלח ל-n8n" (member-initiated, confirmation page showing the exact payload)
 2. Hand-off                             (proposed)
    The server POSTs the package to an n8n webhook, writes `experiment_post_sent`
    to audit_log (no content), keeps the time sent and a hash of the content.
        │
        ▼
 3. n8n: "Experiment post → drafts"      (proposed)   next to the existing weekly draft workflows
    Webhook → numbers lock → Hebrew editor pass → Israeli-social editor pass
            → check that every digit survived → branches:
            a. Telegram: the draft to the review chat (same chat and credential as the group drafts)
            b. Kit: a broadcast in *draft* (subject, preview text, HTML from the Markdown)
            c. Blog: a draft on the blog platform, if it is not Kit
        │
        ▼
 4. Owner reviews in Telegram, edits and publishes in Kit / the blog.
```

## Why push, and not n8n polling the platform

- The member's click is the explicit moment a post leaves the platform. A poller would need a standing token to the platform, a new kind of secret and a new place health numbers can be read from.
- The platform stays passive: n8n needs no credential to it, and the webhook URL lives in a committed config file (`src/config/blog.ts`, with an optional header secret), like the other config files.
- Retries are safe: the idempotency key is the experiment id plus a hash of the package, so sending the same text twice makes no second draft, and an edited text makes a new one.

## What the existing n8n instance already has

- Three published workflows that write weekly Facebook-group post drafts (Sleep, Fitness and sport, HealthTech Israel): RSS, Claude drafts, **two editor passes** (Hebrew language, Israeli social), then a Telegram message to a review chat. The experiment workflow should reuse the two editor prompts and the review chat.
- Credentials: Telegram and Anthropic. **There is no Kit credential yet**: it must be added in n8n before branch b.
- The Kit account has one broadcast in draft (the caffeine post), and a creator profile page. A Kit broadcast marked public shows on that profile as a post.

## Rules for the hand-off

- Member-initiated, with a confirmation page. Never automatic, and not on a schedule.
- Separate from `care_team`: it neither reads nor widens any consent scope.
- Only the package leaves: aggregates and one line per night. No name, no time series. Never put it in a URL or a log, and write nothing but the fact of sending to `audit_log`.
- The editor passes may change wording but not figures: a Code node compares the digits before and after and stops the run if they differ.
- Telegram and Kit are third parties. The member sees that on the confirmation page.

## Decisions needed before step 2 and 3 are built

1. **Where is the blog?** If it is Kit's creator profile, the blog post and the newsletter are one Kit broadcast (`public` = on the blog), and branch c disappears. If it is elsewhere (Ghost, WordPress, Substack, a Markdown repo), which one, and does it have an API for drafts?
2. **What is a Telegram draft?** A message to the review chat that the owner copies out (what the existing workflows do), or a post prepared for a channel?
3. **Voice.** Run both editor passes on experiment posts, or only on the Telegram text and keep the blog in the member's own words?
4. **Charts.** A picture of the main chart in the blog or newsletter needs a public image URL, which means a public place for health data. Proposal: text and tables only for now, and an inline SVG in the Markdown later if the blog allows it.
