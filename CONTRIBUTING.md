# Contributing Rules

Use a pull request or the issue template. The preferred first version is a PR that changes only a
`rules/*.jsonl` source file.

## Checklist

- The hash was produced by NextE or a compatible dct64-v1 pHash implementation.
- The rule targets a repeated ad page or ad image, not normal gallery content.
- `threshold` is between 0 and 12.
- `sourceUrl`, when present, is a public review link and contains no cookie, token, `igneous`,
  `ipb_pass_hash`, `ipb_member_id`, `nl`, `showkey`, or other private query values.
- `sourcePage`, when present, is the 1-based page number inside the public review gallery.
- `note` is short and contains no private reading history.

## App Draft Import

When a contributor copies JSONL from NextE's Image blocks settings page, review it with a dry run first:

```bash
node tools/rules.mjs import-jsonl --feed zh-scanlator-ads --file /path/to/app-draft.jsonl
```

Only after the summary shows the expected new rows and no invalid rows, apply it:

```bash
node tools/rules.mjs import-jsonl --feed zh-scanlator-ads --file /path/to/app-draft.jsonl --apply
```

The importer requires both `sourceUrl` and `sourcePage`, skips hashes already present in the target feed,
reports duplicate incoming hashes, and refuses to apply drafts with invalid or unsafe rows.

## Review Model

Maintainers review `rules/*.jsonl`. CI validates the source files and regenerates `dist/`.
Clients consume only generated `dist/` files.

The repository intentionally starts without account systems, voting, or a submission backend. GitHub PR
review is the moderation layer until volume proves otherwise.
