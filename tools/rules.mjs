#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FEEDS_PATH = join(ROOT, 'feeds.json')
const DIST_DIR = join(ROOT, 'dist')
const HASH_RE = /^[0-9a-f]{16}$/
const MAX_THRESHOLD = 12
const MAX_SOURCE_PAGE = 100000

function usage() {
  console.log(`Usage:
  node tools/rules.mjs validate
  node tools/rules.mjs build
  node tools/rules.mjs stats
  node tools/rules.mjs find --hash <hex> | --source-url <url>
  node tools/rules.mjs add --feed <id> --hash <hex> [--threshold 8] [--label scanlator-ad] [--source-url <url>] [--source-page <n>] [--note <text>]
  node tools/rules.mjs import-jsonl --feed <id> --file <draft.jsonl|-> [--apply] [--no-build]`)
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      out[key] = 'true'
    } else {
      out[key] = next
      i++
    }
  }
  return out
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function loadFeeds() {
  const feeds = readJson(FEEDS_PATH)
  if (!Array.isArray(feeds) || feeds.length === 0) {
    throw new Error('feeds.json must contain at least one feed')
  }
  return feeds
}

function readJsonl(path) {
  if (!existsSync(path)) return []
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  const rows = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.length === 0) continue
    try {
      rows.push({ row: JSON.parse(line), line: i + 1 })
    } catch (error) {
      throw new Error(`${path}:${i + 1}: invalid JSON`)
    }
  }
  return rows
}

function normalizeRule(row, feed, line, wherePrefix = feed.file) {
  const hash = typeof row.hash === 'string' ? row.hash.toLowerCase() : ''
  const threshold = Number.isInteger(row.threshold) ? row.threshold : feed.defaultThreshold
  const label = typeof row.label === 'string' && row.label.trim().length > 0
    ? row.label.trim()
    : 'scanlator-ad'
  const scope = typeof row.scope === 'string' && row.scope.length > 0 ? row.scope : 'whole'
  const sourceUrl = typeof row.sourceUrl === 'string' ? row.sourceUrl.trim() : ''
  const sourcePage = row.sourcePage
  const note = typeof row.note === 'string' ? row.note.trim() : ''
  const normalized = { hash, threshold, label, scope }
  if (sourceUrl.length > 0) normalized.sourceUrl = sourceUrl
  if (sourcePage !== undefined) normalized.sourcePage = sourcePage
  if (note.length > 0) normalized.note = note
  validateRule(normalized, feed, line, wherePrefix)
  return normalized
}

function validateRule(rule, feed, line, wherePrefix = feed.file) {
  const where = `${wherePrefix}:${line}`
  if (!HASH_RE.test(rule.hash)) {
    throw new Error(`${where}: hash must be 16 lowercase hex characters`)
  }
  if (!Number.isInteger(rule.threshold) || rule.threshold < 0 || rule.threshold > MAX_THRESHOLD) {
    throw new Error(`${where}: threshold must be an integer from 0 to ${MAX_THRESHOLD}`)
  }
  if (rule.scope !== 'whole') {
    throw new Error(`${where}: only scope=whole is supported for v1`)
  }
  if (rule.label.length > 48) {
    throw new Error(`${where}: label is too long`)
  }
  if (rule.sourceUrl !== undefined && unsafeSourceUrl(rule.sourceUrl)) {
    throw new Error(`${where}: sourceUrl appears to contain private or temporary image data`)
  }
  if (rule.sourcePage !== undefined &&
    (!Number.isInteger(rule.sourcePage) || rule.sourcePage < 1 || rule.sourcePage > MAX_SOURCE_PAGE)) {
    throw new Error(`${where}: sourcePage must be an integer from 1 to ${MAX_SOURCE_PAGE}`)
  }
}

function unsafeSourceUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch (error) {
    return true
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return true
  const lower = raw.toLowerCase()
  const banned = [
    'cookie=',
    'ipb_pass_hash',
    'ipb_member_id',
    'igneous',
    'pass_hash',
    'fullimg.php',
    'showkey',
    'nl=',
    'sk=',
    'token=',
    'auth=',
    'password=',
    'passwd=',
    'session=',
    'sid=',
  ]
  for (const token of banned) {
    if (lower.includes(token)) return true
  }
  const host = url.hostname.toLowerCase()
  if ((host === 's.exhentai.org' || host === 's.e-hentai.org') && url.pathname.startsWith('/s/')) {
    return true
  }
  return false
}

function loadRules(feed) {
  const rows = readJsonl(join(ROOT, feed.file))
  return rows.map(({ row, line }) => normalizeRule(row, feed, line))
}

function validateAll() {
  const feeds = loadFeeds()
  const seen = new Set()
  for (const feed of feeds) {
    const rules = loadRules(feed)
    for (const rule of rules) {
      const key = `${feed.id}:${rule.hash}`
      if (seen.has(key)) {
        throw new Error(`${feed.file}: duplicate hash ${rule.hash}`)
      }
      seen.add(key)
    }
  }
  console.log(`OK: ${seen.size} rules across ${feeds.length} feed(s)`)
}

function clientRule(rule) {
  return {
    hash: rule.hash,
    threshold: rule.threshold,
    label: rule.label,
    scope: rule.scope,
  }
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function buildAll() {
  validateAll()
  mkdirSync(DIST_DIR, { recursive: true })
  const feeds = loadFeeds()
  const manifestFeeds = []
  const report = ['# Review Report', '']
  let manifestUpdatedAt = 0
  for (const feed of feeds) {
    const rules = loadRules(feed).sort((a, b) => a.hash.localeCompare(b.hash))
    const feedUpdatedAt = maxUpdatedAt(rules)
    manifestUpdatedAt = Math.max(manifestUpdatedAt, feedUpdatedAt)
    const distFeed = {
      schema: 1,
      kind: 'nexte-image-block-feed',
      id: feed.id,
      title: feed.title,
      algorithm: feed.algorithm,
      defaultThreshold: feed.defaultThreshold,
      updatedAt: feedUpdatedAt,
      items: rules.map(clientRule),
    }
    const distName = `${feed.id}.json`
    const body = `${JSON.stringify(distFeed, null, 2)}\n`
    writeFileSync(join(DIST_DIR, distName), body)
    manifestFeeds.push({
      id: feed.id,
      title: feed.title,
      url: `https://raw.githubusercontent.com/erosTeam/nexte-image-block-rules/main/dist/${distName}`,
      algorithm: feed.algorithm,
      defaultThreshold: feed.defaultThreshold,
      count: rules.length,
      sha256: sha256(body),
    })
    report.push(`## ${feed.id}`, '')
    report.push(`- Rules: ${rules.length}`)
    report.push('')
    for (const rule of rules) {
      const source = rule.sourceUrl ? ` [source](${rule.sourceUrl})` : ''
      const page = Number.isInteger(rule.sourcePage) ? ` P${rule.sourcePage}` : ''
      const note = rule.note ? ` - ${rule.note}` : ''
      report.push(`- \`${rule.hash}\` threshold=${rule.threshold} label=${rule.label}${source}${page}${note}`)
    }
    report.push('')
  }
  const manifest = {
    schema: 1,
    kind: 'nexte-image-block-manifest',
    updatedAt: manifestUpdatedAt,
    feeds: manifestFeeds,
  }
  writeFileSync(join(DIST_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(DIST_DIR, 'review-report.md'), `${report.join('\n').trim()}\n`)
  console.log(`Built ${manifestFeeds.length} feed(s)`)
}

function maxUpdatedAt(rules) {
  let out = 0
  for (const rule of rules) {
    if (Number.isInteger(rule.updatedAt) && rule.updatedAt > out) out = rule.updatedAt
  }
  return out
}

function stats() {
  const feeds = loadFeeds()
  for (const feed of feeds) {
    const rules = loadRules(feed)
    const withSource = rules.filter(rule => rule.sourceUrl !== undefined).length
    const withSourcePage = rules.filter(rule => rule.sourcePage !== undefined).length
    console.log(`${feed.id}: ${rules.length} rules, ${withSource} sourceUrl, ${withSourcePage} sourcePage`)
  }
}

function find(args) {
  const hash = args.hash ? args.hash.toLowerCase() : ''
  const sourceUrl = args.sourceUrl || ''
  if (hash.length === 0 && sourceUrl.length === 0) {
    throw new Error('find needs --hash or --source-url')
  }
  const feeds = loadFeeds()
  let found = 0
  for (const feed of feeds) {
    const rules = loadRules(feed)
    for (const rule of rules) {
      if ((hash.length > 0 && rule.hash === hash) ||
        (sourceUrl.length > 0 && rule.sourceUrl === sourceUrl)) {
        console.log(`${feed.id}: ${JSON.stringify(rule)}`)
        found++
      }
    }
  }
  if (found === 0) {
    console.log('No matching rule')
  }
}

function add(args) {
  const feedId = args.feed || ''
  const feeds = loadFeeds()
  const feed = feeds.find(item => item.id === feedId)
  if (feed === undefined) {
    throw new Error(`unknown feed: ${feedId}`)
  }
  const hash = args.hash ? args.hash.toLowerCase() : ''
  const rule = {
    hash,
    threshold: args.threshold !== undefined ? Number(args.threshold) : feed.defaultThreshold,
    label: args.label || 'scanlator-ad',
    scope: args.scope || 'whole',
  }
  if (args.sourceUrl !== undefined) rule.sourceUrl = args.sourceUrl
  if (args.sourcePage !== undefined) rule.sourcePage = Number(args.sourcePage)
  if (args.note !== undefined) rule.note = args.note
  validateRule(rule, feed, 'new')
  const existing = loadRules(feed)
  if (existing.some(item => item.hash === rule.hash)) {
    throw new Error(`${feed.id}: duplicate hash ${rule.hash}`)
  }
  const path = join(ROOT, feed.file)
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(rule)}\n`)
  console.log(`Added ${rule.hash} to ${feed.id}`)
}

function importJsonl(args) {
  const feedId = args.feed || ''
  const feeds = loadFeeds()
  const feed = feeds.find(item => item.id === feedId)
  if (feed === undefined) {
    throw new Error(`unknown feed: ${feedId}`)
  }
  const file = args.file || ''
  if (file.length === 0) {
    throw new Error('import-jsonl needs --file <draft.jsonl|->')
  }
  const apply = args.apply === 'true'
  const noBuild = args.noBuild === 'true'
  const importRows = readImportJsonl(file, feed)
  const existing = loadRules(feed)
  const existingHashes = new Set(existing.map(rule => rule.hash))
  const incomingHashes = new Set()
  const pending = []
  const duplicateExisting = []
  const duplicateIncoming = []
  for (const item of importRows.valid) {
    if (existingHashes.has(item.rule.hash)) {
      duplicateExisting.push(item)
      continue
    }
    if (incomingHashes.has(item.rule.hash)) {
      duplicateIncoming.push(item)
      continue
    }
    incomingHashes.add(item.rule.hash)
    pending.push(item)
  }
  printImportSummary(feed, file, pending, duplicateExisting, duplicateIncoming, importRows.invalid, apply)
  if (!apply) {
    return
  }
  if (importRows.invalid.length > 0) {
    throw new Error('import-jsonl refused to apply because the draft contains invalid rows')
  }
  if (pending.length === 0) {
    console.log('No new rules to append')
    return
  }
  const path = join(ROOT, feed.file)
  mkdirSync(dirname(path), { recursive: true })
  let body = ''
  for (const item of pending) {
    body += `${JSON.stringify(item.rule)}\n`
  }
  appendFileSync(path, body)
  console.log(`Appended ${pending.length} rule(s) to ${feed.file}`)
  if (!noBuild) {
    buildAll()
  }
}

function readImportJsonl(file, feed) {
  const sourceName = file === '-' ? '<stdin>' : file
  const text = file === '-'
    ? readFileSync(0, 'utf8')
    : readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const valid = []
  const invalid = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.length === 0) continue
    try {
      const row = JSON.parse(line)
      const rule = normalizeRule(row, feed, i + 1, sourceName)
      if (rule.sourceUrl === undefined || rule.sourceUrl.length === 0) {
        throw new Error(`${sourceName}:${i + 1}: sourceUrl is required for app-imported review drafts`)
      }
      if (rule.sourcePage === undefined) {
        throw new Error(`${sourceName}:${i + 1}: sourcePage is required for app-imported review drafts`)
      }
      valid.push({ rule, line: i + 1 })
    } catch (error) {
      invalid.push({
        line: i + 1,
        message: error.message,
      })
    }
  }
  return { valid, invalid }
}

function printImportSummary(feed, file, pending, duplicateExisting, duplicateIncoming, invalid, apply) {
  console.log(`${apply ? 'Import' : 'Import dry-run'} for ${feed.id} from ${file}`)
  console.log(`new=${pending.length} duplicateExisting=${duplicateExisting.length} duplicateIncoming=${duplicateIncoming.length} invalid=${invalid.length}`)
  for (const item of pending) {
    const source = item.rule.sourceUrl ? ` source=${item.rule.sourceUrl}` : ''
    const page = Number.isInteger(item.rule.sourcePage) ? ` page=${item.rule.sourcePage}` : ''
    const note = item.rule.note ? ` note="${item.rule.note}"` : ''
    console.log(`+ line ${item.line}: ${item.rule.hash} threshold=${item.rule.threshold} label=${item.rule.label}${source}${page}${note}`)
  }
  for (const item of duplicateExisting) {
    console.log(`= line ${item.line}: duplicate existing hash ${item.rule.hash}`)
  }
  for (const item of duplicateIncoming) {
    console.log(`= line ${item.line}: duplicate incoming hash ${item.rule.hash}`)
  }
  for (const item of invalid) {
    console.log(`! line ${item.line}: ${item.message}`)
  }
}

function main() {
  const command = process.argv[2]
  const args = parseArgs(process.argv.slice(3))
  if (!command || command === 'help') {
    usage()
    return
  }
  if (command === 'validate') return validateAll()
  if (command === 'build') return buildAll()
  if (command === 'stats') return stats()
  if (command === 'find') return find(args)
  if (command === 'add') return add(args)
  if (command === 'import-jsonl') return importJsonl(args)
  throw new Error(`unknown command: ${command}`)
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
