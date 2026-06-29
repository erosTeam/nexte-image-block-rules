# NextE Image Block Rules

Community-maintained perceptual-hash rules for hiding repeated scanlator ad images in NextE.

This repository is data-only. It does not host scripts for clients, user tracking data, cookies,
gallery ids, or image binaries.

## Subscription

NextE clients should subscribe to the generated manifest:

```text
https://raw.githubusercontent.com/erosTeam/nexte-image-block-rules/main/dist/manifest.json
```

The generated `dist/` files contain only client-safe rule data:

- `hash`
- `threshold`
- `label`
- `scope`

Reviewer-only fields such as `sourceUrl`, `sourcePage`, and `note` are kept in `rules/*.jsonl` and are
removed from `dist/`.

## Rules

Rules are edited in JSON Lines files under `rules/`.

```json
{"hash":"0123456789abcdef","threshold":8,"label":"scanlator-ad","scope":"whole","sourceUrl":"https://example.com/review-gallery","sourcePage":1,"note":"full-page ad"}
```

Fields:

- `hash`: 16-character hex dct64-v1 pHash.
- `threshold`: integer from 0 to 12. Use 8 unless there is a good reason.
- `label`: short category, usually `scanlator-ad`.
- `scope`: `whole` for first-version full-image matching.
- `sourceUrl`: optional review link. It is not published to clients.
- `sourcePage`: optional 1-based page number for the review link. It is not published to clients.
- `note`: optional maintainer note. It is not published to clients.

## Commands

```bash
node tools/rules.mjs validate
node tools/rules.mjs build
node tools/test_import_jsonl.mjs
node tools/rules.mjs stats
node tools/rules.mjs find --hash 0123456789abcdef
```

Review an app-copied JSONL draft without changing files:

```bash
node tools/rules.mjs import-jsonl \
  --feed zh-scanlator-ads \
  --file /path/to/app-draft.jsonl
```

App-copied drafts must include both `sourceUrl` and `sourcePage` so maintainers can jump to the exact
review page.

Append valid, non-duplicate draft rows and regenerate `dist/`:

```bash
node tools/rules.mjs import-jsonl \
  --feed zh-scanlator-ads \
  --file /path/to/app-draft.jsonl \
  --apply
```

Add a rule:

```bash
node tools/rules.mjs add \
  --feed zh-scanlator-ads \
  --hash 0123456789abcdef \
  --threshold 8 \
  --source-url https://example.com/review-gallery \
  --source-page 1 \
  --note "full-page ad"
```

## Privacy

Do not submit:

- EH cookies, tokens, or signed temporary image URLs.
- Gallery ids/tokens unless a maintainer explicitly asks in an issue.
- Full original images.
- Any source URL containing credentials or private query parameters.

The app-side contribution flow should make `sourceUrl` and `sourcePage` explicit and user-confirmed.
