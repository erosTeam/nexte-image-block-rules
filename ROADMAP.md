# Roadmap

## Phase 0: Data Repo

- Source rules in `rules/*.jsonl`.
- Generated subscription files in `dist/`.
- CLI for add, validate, build, stats, and find.
- GitHub Actions validation on every PR.

## Phase 1: NextE Client Consumption

- Built-in manifest URL.
- Manual refresh and cached feed replacement.
- RDB storage for subscriptions, subscription rules, local rules, and whitelist.
- Reader-side `ImageBlockService` that returns block decisions without owning UI.

## Phase 2: App-Assisted Contribution

- Export a JSONL rule snippet from the app.
- Open a prefilled GitHub issue or PR page.
- Strip or warn about unsafe `sourceUrl` values before submission.

## Phase 3: One-Tap Pull Requests

- Optional GitHub OAuth.
- Fork, branch, commit to user fork, and open PR through GitHub APIs.
- No direct write to `erosTeam/nexte-image-block-rules`.

## Deferred

- QR-code auto blocking.
- Region/crop pHash rules.
- Signed feed metadata.
- BK-tree or other hash index.
- Bot moderation or voting.
