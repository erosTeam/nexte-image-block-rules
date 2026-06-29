# Contributing Rules

Use a pull request or the issue template. The preferred first version is a PR that changes only a
`rules/*.jsonl` source file.

## Checklist

- The hash was produced by NextE or a compatible dct64-v1 pHash implementation.
- The rule targets a repeated ad page or ad image, not normal gallery content.
- `threshold` is between 0 and 12.
- `sourceUrl`, when present, is a public review link and contains no cookie, token, `igneous`,
  `ipb_pass_hash`, `ipb_member_id`, `nl`, `showkey`, or other private query values.
- `note` is short and contains no private reading history.

## Review Model

Maintainers review `rules/*.jsonl`. CI validates the source files and regenerates `dist/`.
Clients consume only generated `dist/` files.

The repository intentionally starts without account systems, voting, or a submission backend. GitHub PR
review is the moderation layer until volume proves otherwise.
