#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WORK = mkdtempSync(join(tmpdir(), 'nexte-image-block-rules-import-'))

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function run(args, options = {}) {
  return execFileSync(process.execPath, ['tools/rules.mjs', ...args], {
    cwd: WORK,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
}

function runMaybe(args) {
  return spawnSync(process.execPath, ['tools/rules.mjs', ...args], {
    cwd: WORK,
    encoding: 'utf8',
  })
}

function writeDraft(name, rows) {
  const path = join(WORK, name)
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`)
  return path
}

cpSync(ROOT, WORK, {
  recursive: true,
  filter: (path) => {
    return !path.includes(`${sep}.git${sep}`) && !path.endsWith(`${sep}.git`)
  },
})

assert(existsSync(join(WORK, 'tools', 'rules.mjs')), 'temporary rules repo copy must include CLI')

const mixedDraft = writeDraft('mixed-draft.jsonl', [
  {
    hash: 'aaaaaaaaaaaaaaaa',
    threshold: 8,
    label: 'scanlator-ad',
    scope: 'whole',
    sourceUrl: 'https://e-hentai.org/g/1284740/ed8b71498d/',
    sourcePage: 1,
    note: 'first page',
  },
  {
    hash: 'aaaaaaaaaaaaaaaa',
    threshold: 8,
    label: 'scanlator-ad',
    scope: 'whole',
    sourceUrl: 'https://e-hentai.org/g/1284740/ed8b71498d/',
    sourcePage: 1,
    note: 'duplicate in same draft',
  },
  {
    hash: 'bbbbbbbbbbbbbbbb',
    threshold: 8,
    label: 'scanlator-ad',
    scope: 'whole',
    sourceUrl: 'https://e-hentai.org/fullimg.php?token=private',
    sourcePage: 2,
    note: 'unsafe',
  },
  {
    hash: 'dddddddddddddddd',
    threshold: 8,
    label: 'scanlator-ad',
    scope: 'whole',
    sourceUrl: 'https://e-hentai.org/g/1284740/ed8b71498d/',
    sourcePage: 0,
    note: 'bad page',
  },
  {
    hash: 'eeeeeeeeeeeeeeee',
    threshold: 8,
    label: 'scanlator-ad',
    scope: 'whole',
    sourceUrl: 'https://e-hentai.org/g/1284740/ed8b71498d/',
    note: 'missing page',
  },
])

const dryRun = run(['import-jsonl', '--feed', 'zh-scanlator-ads', '--file', mixedDraft])
assert(dryRun.includes('new=1 duplicateExisting=0 duplicateIncoming=1 invalid=3'), 'dry-run must summarize new, duplicate incoming, and invalid rows')
assert(dryRun.includes('page=1'), 'dry-run must report structured sourcePage values')
assert(dryRun.includes(`${mixedDraft}:3: sourceUrl appears to contain private or temporary image data`), 'dry-run must report the draft file path for invalid rows')
assert(dryRun.includes(`${mixedDraft}:4: sourcePage must be an integer from 1 to 100000`), 'dry-run must reject invalid sourcePage values')
assert(dryRun.includes(`${mixedDraft}:5: sourcePage is required for app-imported review drafts`), 'dry-run must require sourcePage for app-copied drafts')

const refused = runMaybe(['import-jsonl', '--feed', 'zh-scanlator-ads', '--file', mixedDraft, '--apply'])
assert(refused.status !== 0, 'apply must fail when the draft contains invalid rows')
assert(`${refused.stdout}\n${refused.stderr}`.includes('refused to apply'), 'failed apply must explain the refusal')

const cleanDraft = writeDraft('clean-draft.jsonl', [
  {
    hash: 'cccccccccccccccc',
    threshold: 8,
    label: 'scanlator-ad',
    scope: 'whole',
    sourceUrl: 'https://e-hentai.org/g/1284740/ed8b71498d/',
    sourcePage: 3,
    note: 'clean apply smoke',
  },
])
const applyOut = run(['import-jsonl', '--feed', 'zh-scanlator-ads', '--file', cleanDraft, '--apply'])
assert(applyOut.includes('Appended 1 rule(s)'), 'clean apply must append one rule')
assert(applyOut.includes('Built 1 feed(s)'), 'clean apply must rebuild dist by default')

const sourceRules = readFileSync(join(WORK, 'rules', 'zh-scanlator-ads.jsonl'), 'utf8')
assert(sourceRules.includes('"hash":"cccccccccccccccc"'), 'clean apply must persist the new source rule')
assert(sourceRules.includes('"sourcePage":3'), 'clean apply must persist structured source page evidence')

const distFeed = JSON.parse(readFileSync(join(WORK, 'dist', 'zh-scanlator-ads.json'), 'utf8'))
assert(distFeed.items.length === 2, 'clean apply must rebuild the client feed with the new rule')
assert(distFeed.items.some((item) => item.hash === 'cccccccccccccccc'), 'rebuilt client feed must include the imported hash')
const cleanDistRule = distFeed.items.find((item) => item.hash === 'cccccccccccccccc')
assert(cleanDistRule.sourcePage === undefined, 'rebuilt client feed must strip reviewer-only sourcePage')

run(['validate'])

console.log('OK: import-jsonl smoke passed')
