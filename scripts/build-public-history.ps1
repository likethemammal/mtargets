#Requires -Version 5.1
<#
.SYNOPSIS
  Rebuild local main as a clean 25-commit public history.
  Authors as Chris Dolphin <dolphin@likethemammal.com> (GitHub-linked).
  Does NOT push to GitLab. Force-push to github separately if needed.
#>
param(
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [string]$TipRef = "HEAD",
  [switch]$SkipReplaceMain,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-Location $RepoRoot

function Invoke-Git {
  param([string[]]$GitArgs)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & git.exe @GitArgs 2>&1 | ForEach-Object {
    if ($_ -is [System.Management.Automation.ErrorRecord]) {
      Write-Host $_.ToString()
    }
    else {
      Write-Host $_
    }
  }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) {
    throw ("git {0} failed with exit {1}" -f ($GitArgs -join " "), $code)
  }
}

$manifestPath = Join-Path $PSScriptRoot "public-history-manifest.json"
if (-not (Test-Path $manifestPath)) {
  throw "Missing manifest: $manifestPath"
}
$manifest = Get-Content -Raw -Path $manifestPath | ConvertFrom-Json
$authorName = $manifest.authorName
$authorEmail = $manifest.authorEmail

& git.exe rev-parse --verify $TipRef 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Missing tip ref: $TipRef"
}
$tipSha = (& git.exe rev-parse $TipRef).Trim()

$tipDir = Join-Path $env:TEMP ("mtargets-public-tip-" + [guid]::NewGuid().ToString("n"))
$workBranch = "public-main"
$scriptBackupDir = Join-Path $env:TEMP ("mtargets-scripts-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $scriptBackupDir | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot "build-public-history.ps1") (Join-Path $scriptBackupDir "build-public-history.ps1")
Copy-Item -Force $manifestPath (Join-Path $scriptBackupDir "public-history-manifest.json")

function Reset-TipExport {
  if (Test-Path $tipDir) {
    Remove-Item -Recurse -Force $tipDir
  }
  New-Item -ItemType Directory -Path $tipDir | Out-Null

  $tmpIndex = Join-Path $env:TEMP ("mtargets-public-history-" + [guid]::NewGuid().ToString("n") + ".index")
  $prevIndex = $env:GIT_INDEX_FILE
  try {
    $env:GIT_INDEX_FILE = $tmpIndex
    Invoke-Git @("read-tree", $tipSha)
    $prefix = $tipDir.TrimEnd('\', '/') + "/"
    Invoke-Git @("checkout-index", "-a", "--prefix=$prefix")
  }
  finally {
    if ([string]::IsNullOrEmpty($prevIndex)) {
      Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
    }
    else {
      $env:GIT_INDEX_FILE = $prevIndex
    }
    if (Test-Path $tmpIndex) { Remove-Item -Force $tmpIndex }
  }

  # Ensure rewrite tooling matches the backed-up copies (author identity, etc.)
  $scriptsTip = Join-Path $tipDir "scripts"
  if (-not (Test-Path $scriptsTip)) {
    New-Item -ItemType Directory -Path $scriptsTip | Out-Null
  }
  Copy-Item -Force (Join-Path $scriptBackupDir "build-public-history.ps1") (Join-Path $scriptsTip "build-public-history.ps1")
  Copy-Item -Force (Join-Path $scriptBackupDir "public-history-manifest.json") (Join-Path $scriptsTip "public-history-manifest.json")
}

function Get-TipFiles {
  Get-ChildItem -Path $tipDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($tipDir.Length).TrimStart('\', '/')
    $rel.Replace('\', '/')
  }
}

function Resolve-ManifestPaths {
  param(
    [string[]]$Paths,
    [string[]]$AllTipFiles
  )
  $resolved = New-Object System.Collections.Generic.List[string]
  foreach ($p in $Paths) {
    $norm = $p.Replace('\', '/')
    if ($norm.EndsWith('/')) {
      foreach ($f in $AllTipFiles) {
        if ($f.StartsWith($norm)) { $resolved.Add($f) }
      }
    }
    elseif ($AllTipFiles -contains $norm) {
      $resolved.Add($norm)
    }
    else {
      Write-Warning "Path not in tip export (skipped): $norm"
    }
  }
  $resolved | Select-Object -Unique
}

function Copy-TipPathsToRepo {
  param([string[]]$RelPaths)
  foreach ($rel in $RelPaths) {
    $src = Join-Path $tipDir ($rel.Replace('/', [IO.Path]::DirectorySeparatorChar))
    $dst = Join-Path $RepoRoot ($rel.Replace('/', [IO.Path]::DirectorySeparatorChar))
    $dstDir = Split-Path -Parent $dst
    if ($dstDir -and -not (Test-Path $dstDir)) {
      New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
    }
    Copy-Item -Force $src $dst
  }
}

Write-Host ("Exporting tip from {0} ({1})..." -f $TipRef, $tipSha.Substring(0, 7))
Reset-TipExport
$allTipFiles = @(Get-TipFiles)
Write-Host ("Tip file count: {0}" -f $allTipFiles.Count)
Write-Host ("Author: {0} <{1}>" -f $authorName, $authorEmail)

if ($DryRun) {
  $added = New-Object System.Collections.Generic.HashSet[string]
  $i = 0
  foreach ($c in $manifest.commits) {
    $i++
    $batch = @(Resolve-ManifestPaths -Paths @($c.paths) -AllTipFiles $allTipFiles)
    foreach ($f in $batch) { [void]$added.Add($f) }
    if ($c.includeRemaining) {
      $remaining = @($allTipFiles | Where-Object { -not $added.Contains($_) })
      Write-Host ("{0,2}. {1}  paths={2} remaining={3}  {4}" -f $i, $c.date, $batch.Count, $remaining.Count, $c.message)
    }
    else {
      Write-Host ("{0,2}. {1}  paths={2}  {3}" -f $i, $c.date, $batch.Count, $c.message)
    }
  }
  Remove-Item -Recurse -Force $tipDir -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $scriptBackupDir -ErrorAction SilentlyContinue
  exit 0
}

# Snapshot previous main tip for local recovery (does not touch remotes)
Invoke-Git @("branch", "-f", "archive/pre-relink-main", $tipSha)

Invoke-Git @("checkout", "--detach", $tipSha)
& git.exe show-ref --verify --quiet "refs/heads/$workBranch"
if ($LASTEXITCODE -eq 0) {
  Invoke-Git @("branch", "-D", $workBranch)
}
Invoke-Git @("checkout", "--orphan", $workBranch)

$prev = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& git.exe rm -rf --quiet . 2>&1 | Out-Null
& git.exe clean -fdx -e node_modules -e website/node_modules 2>&1 | Out-Null
$ErrorActionPreference = $prev

if (-not (Test-Path $tipDir)) {
  Reset-TipExport
  $allTipFiles = @(Get-TipFiles)
}

$committed = New-Object System.Collections.Generic.HashSet[string]
$commitIndex = 0
foreach ($c in $manifest.commits) {
  $commitIndex++
  $batch = New-Object System.Collections.Generic.List[string]
  foreach ($f in (Resolve-ManifestPaths -Paths @($c.paths) -AllTipFiles $allTipFiles)) {
    if (-not $committed.Contains($f)) { $batch.Add($f) }
  }
  if ($c.includeRemaining) {
    foreach ($f in $allTipFiles) {
      if (-not $committed.Contains($f) -and -not ($batch -contains $f)) {
        $batch.Add($f)
      }
    }
  }
  if ($batch.Count -eq 0) {
    throw ("Commit {0} has no files: {1}" -f $commitIndex, $c.message)
  }

  Copy-TipPathsToRepo -RelPaths @($batch)

  $addArgs = New-Object System.Collections.Generic.List[string]
  $addArgs.Add("add")
  $addArgs.Add("--")
  foreach ($f in $batch) { $addArgs.Add($f) }
  Invoke-Git $addArgs.ToArray()

  $staged = @(& git.exe diff --cached --name-only)
  if ($staged.Count -eq 0) {
    throw ("Nothing staged for commit {0}: {1}" -f $commitIndex, $c.message)
  }

  $env:GIT_AUTHOR_NAME = $authorName
  $env:GIT_AUTHOR_EMAIL = $authorEmail
  $env:GIT_COMMITTER_NAME = $authorName
  $env:GIT_COMMITTER_EMAIL = $authorEmail
  $env:GIT_AUTHOR_DATE = [string]$c.date
  $env:GIT_COMMITTER_DATE = [string]$c.date

  # --no-gpg-sign / plain -m: no Cursor Co-authored-by trailer
  Invoke-Git @(
    "-c", "trailer.ifexists=doNothing",
    "commit", "--no-verify", "--no-gpg-sign",
    "-m", [string]$c.message
  )
  foreach ($f in $batch) { [void]$committed.Add($f) }
  Write-Host ("Committed {0}/{1}: {2} ({3} files)" -f $commitIndex, $manifest.commits.Count, $c.message, $batch.Count)
}

Remove-Item Env:GIT_AUTHOR_DATE, Env:GIT_COMMITTER_DATE, Env:GIT_AUTHOR_NAME, Env:GIT_AUTHOR_EMAIL, Env:GIT_COMMITTER_NAME, Env:GIT_COMMITTER_EMAIL -ErrorAction SilentlyContinue

$count = [int](& git.exe rev-list --count HEAD)
if ($count -ne $manifest.commits.Count) {
  throw ("Expected {0} commits, got {1}" -f $manifest.commits.Count, $count)
}

# Guard: no Cursor co-author trailers
$trailers = & git.exe log --format=%B | Select-String -Pattern "Co-authored-by:\s*Cursor"
if ($trailers) {
  throw "Cursor Co-authored-by trailer leaked into history"
}

Write-Host ("`nPublic history built on {0} ({1} commits)." -f $workBranch, $count)
Invoke-Git @("log", "--reverse", "--format=%h %ad %an <%ae> %s", "--date=short")

if (-not $SkipReplaceMain) {
  Invoke-Git @("branch", "-M", "main")
  Write-Host "Renamed $workBranch -> main"
}

Remove-Item -Recurse -Force $tipDir -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $scriptBackupDir -ErrorAction SilentlyContinue

Write-Host "`nDone. Force-push with: git push --force-with-lease github main"
