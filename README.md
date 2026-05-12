# dLazy Generate Plugin

OpenClaw **code-plugin** that wraps the entire `@dlazy/cli` generation catalog. Registers one tool — `dlazy_run` — which can invoke any of the 69 dLazy models (image, video, audio, composite pipelines).

## Prerequisites

The plugin spawns `dlazy` as a subprocess, so the CLI must be on PATH:

```bash
npm install -g @dlazy/cli
dlazy login
```

(Or set `apiKey` in plugin config to bypass `dlazy login`.)

## The `dlazy_run` Tool

```json
{
  "model": "veo-3.1",
  "args": { "prompt": "a fox in snow", "image": "https://..." },
  "timeoutSeconds": 600
}
```

- `model` — dlazy subcommand from the catalog (`SKILL.md` lists all 69).
- `args` — object → CLI flags. `true` → bare flag; arrays → repeated flag.
- `timeoutSeconds` — optional, default 300, max 1800.

Returns the JSON envelope printed by `dlazy` on stdout.

## Plugin Config

```json
{
  "command": "dlazy",
  "apiKey": "sk-...",
  "timeoutMs": 300000
}
```

All fields optional.

## Build

```bash
npm install
npm run build   # → dist/index.js
```

## Publish

```bash
clawhub package publish . --family code-plugin --name dlazy-generate-plugin --version 1.0.0
```

## Layout

```
plugin/
├── src/index.ts           # plugin source (gitignored from publish)
├── dist/index.js          # built by `npm run build` — not in git, ships in ClawHub artifact
├── openclaw.plugin.json   # manifest + configSchema
├── package.json           # npm config (files field controls publish contents)
├── tsconfig.json          # TS build config
├── SKILL.md               # 69-model catalog (agent reference)
└── README.md
```

## Regenerating SKILL.md

`SKILL.md` is a merge of every `SKILL.md` under `../skills/`. To refresh after upstream changes, run this from `packages/cli/` (PowerShell):

```powershell
$skillsDir = "skills"
$outPath = "plugin\SKILL.md"
$dirs = Get-ChildItem -Path $skillsDir -Directory | Sort-Object Name

$header = @'
---
name: dlazy-generate
version: 1.0.0
description: All-in-one dLazy generation skill. Bundles every @dlazy/cli model (image, video, audio) plus composite pipelines. Invoke via the dlazy_run tool registered by this plugin.
metadata: {"clawdbot":{"emoji":"🤖","requires":{"bins":["npm","npx"]},"install":"npm install -g @dlazy/cli@1.0.9","installAlternative":"npx @dlazy/cli@1.0.9","homepage":"https://github.com/dlazyai/cli","source":"https://github.com/dlazyai/cli","author":"dlazyai","license":"see-repo","npm":"https://www.npmjs.com/package/@dlazy/cli","configLocation":"~/.dlazy/config.json","apiEndpoints":["api.dlazy.com","files.dlazy.com"]},"openclaw":{"systemPrompt":"Use the dlazy_run tool registered by this plugin. Pass model name + args object. Each section below documents a model and its expected args."}}
---

# dLazy Generate (All Skills)

A single skill that bundles every dLazy generation capability — image, video, audio, and composite pipelines. Each section below documents one model and the flags it accepts.

## How to Invoke

This plugin registers one tool: **`dlazy_run`**.

```json
{ "model": "<model-name>", "args": { "<flag>": "<value>" }, "timeoutSeconds": 300 }
```

- `model` — the dlazy subcommand from the catalog below (e.g. `veo-3.1`, `seedream-4.5`, `suno-music`).
- `args` — object whose keys become CLI flags. `{ prompt: "hi", n: 2 }` → `--prompt hi --n 2`. `true` emits a bare flag. Arrays repeat the flag.
- `timeoutSeconds` — optional, default 300 (max 1800).

Returns the JSON envelope printed by the dlazy CLI on stdout.

## Table of Contents

'@

$toc = ($dirs | ForEach-Object { "- [$($_.Name)](#$($_.Name.ToLower()))" }) -join "`n"
$body = ""
foreach ($d in $dirs) {
  $mdPath = Join-Path $d.FullName "SKILL.md"
  if (-not (Test-Path $mdPath)) { continue }
  $raw = Get-Content -Path $mdPath -Raw -Encoding UTF8
  $stripped = $raw -replace '(?s)^---\r?\n.*?\r?\n---\r?\n', ''
  $stripped = $stripped -replace '(?m)^# \S.*\r?\n', ''
  $stripped = $stripped -replace '(?m)^\[English\]\(\./SKILL\.md\) · \[中文\]\(\./SKILL-cn\.md\)\r?\n', ''
  $stripped = $stripped.TrimStart()
  $body += "`n`n---`n`n# $($d.Name)`n`n$stripped"
}
[System.IO.File]::WriteAllText($outPath, $header + $toc + $body + "`n", [System.Text.UTF8Encoding]::new($false))
```
