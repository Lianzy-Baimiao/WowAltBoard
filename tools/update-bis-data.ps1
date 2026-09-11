<#
  WowAltBoard - tools/update-bis-data.ps1

  One-shot refresh of every static reference file the 毕业装备 / 天赋 panel
  reads. They ship inside the release and never update themselves, so after
  a new season (or whenever the numbers feel stale) this is the command to
  run -- in dependency order, with pre-flight checks and a per-step summary.

      powershell -NoProfile -ExecutionPolicy Bypass -File tools\update-bis-data.ps1
      ... -SkipRio            # skip the ~47-minute raider.io step
      ... -Only tree          # run just one step (name from the table below)
      ... -Lua "D:\...\GearInsight\core\BisData.lua"

  Console output is deliberately pure ASCII (codepage 936 machine; see the
  same note in scan.ps1). All Chinese user-facing text lives in the panel.

  Steps and their inputs:
    class-names    net, fast        wago.tools DB2
    bis            local addon      GearInsight\core\BisData.lua
    talents        local addon      GearInsight_Talents\PopularTalents.lua
    tree           net, fast        raidbots + wago.tools
    maxroll        net, cached      maxroll.gg (pass 1: collect spell IDs)
    spell-names    net, fast        uses maxroll's HTML cache
    maxroll-2      net, cached      maxroll.gg (pass 2: swap in zhCN names)
    rio            net, ~47 min     raider.io, rate-limited on purpose
    icons          net              needs bis + rio outputs
    talent-icons   net              needs tree output
    talent-desc    net              needs tree output
    wcl            net, credentials needs tools\.wcl-auth.json (user-supplied)
#>
[CmdletBinding()]
param(
    [switch]$SkipRio,
    [string]$Only = '',
    [string]$Lua = ''
)

$ErrorActionPreference = 'Continue'
$ToolsDir = $PSScriptRoot
if (-not $ToolsDir) { $ToolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$BaseDir  = Split-Path -Parent $ToolsDir

function Write-Step { param([string]$m) Write-Host "  $m" }
function Write-Info { param([string]$m) Write-Host "  * $m" -ForegroundColor DarkCyan }

# ---- locate the GearInsight addon files (gen-bis / gen-talents read them) ----
# config.json's wowPaths + includeFlavors say where the game is; scan.ps1 does
# the full registry/walk-up dance when they are empty, which is overkill here --
# anyone running this has a working dashboard, so their config is authoritative.
$Config = [pscustomobject]@{ wowPaths = @(); includeFlavors = @() }
$cfgPath = Join-Path $ToolsDir 'config.json'
if (Test-Path -LiteralPath $cfgPath) {
    try {
        $user = [System.IO.File]::ReadAllText($cfgPath, [System.Text.UTF8Encoding]::new($false)) | ConvertFrom-Json
        foreach ($p in $user.PSObject.Properties) {
            $Config | Add-Member -MemberType NoteProperty -Name $p.Name -Value $p.Value -Force
        }
    } catch { }
}

function Find-AddonFile {
    param([Parameter(Mandatory)][string]$Relative)   # e.g. 'GearInsight\core\BisData.lua'
    foreach ($root in @($Config.wowPaths)) {
        if (-not $root) { continue }
        $flavors = @($Config.includeFlavors)
        if (-not $flavors -or -not $flavors.Count) { $flavors = @('_retail_') }
        foreach ($fl in @($flavors)) {
            $p = Join-Path (Join-Path $root $fl) ("Interface\AddOns\" + $Relative)
            if (Test-Path -LiteralPath $p) { return $p }
        }
    }
    # config.json often leaves wowPaths empty (the launcher's auto-detection
    # result is not written back). Same shallow probe as scan.ps1 step 5: every
    # drive root x a handful of known suffixes, never a recursive scan.
    $drives = @(Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue |
                Where-Object { $null -ne $_.Free } | Select-Object -ExpandProperty Root)
    $suffixes = @(
        'World of Warcraft',
        'Games\World of Warcraft',
        'Program Files (x86)\World of Warcraft',
        'Program Files\World of Warcraft',
        'Battle.net\World of Warcraft',
        'Blizzard\World of Warcraft'
    )
    foreach ($d in $drives) {
        foreach ($suf in $suffixes) {
            $p = Join-Path (Join-Path $d $suf) ("_retail_\Interface\AddOns\" + $Relative)
            if (Test-Path -LiteralPath $p) { return $p }
        }
    }
    return $null
}

$bisLua   = if ($Lua)   { $Lua }   else { Find-AddonFile 'GearInsight\core\BisData.lua' }
$talLua   = Find-AddonFile 'GearInsight_Talents\PopularTalents.lua'
$wclAuth  = Join-Path $ToolsDir '.wcl-auth.json'

# ---- the step table: name, args, pre-flight check ---------------------------
# A step whose Check returns a string is skipped with that reason. The two
# maxroll passes are one command run twice on purpose: pass 1 harvests the
# spell-ID list into its HTML cache, fetch-spell-names turns that into a zhCN
# table, pass 2 swaps the names in (mostly cache hits, so it is quick).
$steps = @(
    @{ Name = 'class-names';  Args = @('tools\fetch-class-names.js');  Check = {} },
    @{ Name = 'bis';          Args = @('tools\gen-bis.js');           Check = {
        if (-not $bisLua) { return 'GearInsight addon not found (bis-data.js keeps the bundled copy)' } } },
    @{ Name = 'talents';      Args = @('tools\gen-talents.js');       Check = {
        if (-not $talLua) { return 'GearInsight_Talents addon not found (talent-data.js keeps the bundled copy)' } } },
    @{ Name = 'tree';         Args = @('tools\fetch-talent-tree.js');  Check = {} },
    @{ Name = 'maxroll';      Args = @('tools\fetch-maxroll.js');      Check = {} },
    @{ Name = 'spell-names';  Args = @('tools\fetch-spell-names.js');  Check = {} },
    @{ Name = 'maxroll-2';    Args = @('tools\fetch-maxroll.js');      Check = {} },
    @{ Name = 'rio';          Args = @('tools\fetch-rio.js');          Check = {
        if ($SkipRio) { return 'skipped via -SkipRio' } } },
    @{ Name = 'icons';        Args = @('tools\fetch-icons.js');        Check = {} },
    @{ Name = 'talent-icons'; Args = @('tools\fetch-talent-icons.js'); Check = {} },
    @{ Name = 'talent-desc';  Args = @('tools\fetch-talent-desc.js');  Check = {} },
    @{ Name = 'wcl';          Args = @('tools\fetch-wcl.js');          Check = {
        if (-not (Test-Path -LiteralPath $wclAuth)) {
            # Detailed on purpose: "no credentials" is the one skip a user can
            # act on, so the box says exactly how (pure ASCII - see the header
            # note about codepage 936).
            Write-Host ''
            Write-Host '  ----------------------------------------------------------------' -ForegroundColor Yellow
            Write-Host '   The raid-talents step needs a (free) Warcraft Logs API client:' -ForegroundColor Yellow
            Write-Host '     1. sign in at  https://www.warcraftlogs.com/api/clients/' -ForegroundColor Yellow
            Write-Host '     2. "Create a Client" - any name, e.g. WowAltBoard - save it' -ForegroundColor Yellow
            Write-Host '     3. copy the Client ID / Client Secret into this file:' -ForegroundColor Yellow
            Write-Host '          tools\.wcl-auth.json' -ForegroundColor Yellow
            Write-Host '        with the shape  { "clientId": "...", "clientSecret": "..." }' -ForegroundColor Yellow
            Write-Host '     (or set WCL_CLIENT_ID / WCL_CLIENT_SECRET in the environment).' -ForegroundColor Yellow
            Write-Host '      The file is gitignored - credentials must never be committed.' -ForegroundColor Yellow
            Write-Host '  ----------------------------------------------------------------' -ForegroundColor Yellow
            return 'no tools\.wcl-auth.json yet - see the box above for how to get one'
        } } }
)

$run = @($steps)
if ($Only) {
    $run = @($steps | Where-Object { $_.Name -eq $Only })
    if (-not $run.Count) {
        Write-Host "No step named '$Only'. Valid: $($steps.Name -join ', ')"
        exit 1
    }
}

Write-Host ''
Write-Host 'WowAltBoard reference-data update'
Write-Host ('-' * 62)
if (-not $bisLua) { Write-Info 'GearInsight not found under the configured wowPaths - bis/talents steps will be skipped.' }
else { Write-Info "GearInsight: $bisLua" }
Write-Host ''

$done = 0; $failed = @(); $skipped = @()
foreach ($s in $run) {
    $done++
    $reason = ''
    if ($s.Check) { $reason = & $s.Check }
    if ($reason) {
        $skipped += $s.Name
        Write-Host ('[{0}/{1}] {2,-13} SKIPPED  {3}' -f $done, $run.Count, $s.Name, $reason)
        continue
    }
    # gen-bis / gen-talents default to this machine's paths; hand them ours.
    $extra = @()
    if ($s.Name -eq 'bis' -and $bisLua) { $extra = @('--lua', $bisLua) }
    if ($s.Name -eq 'talents' -and $talLua) { $extra = @('--lua', $talLua) }

    Write-Host ('[{0}/{1}] {2,-13} running  node {3} {4}' -f $done, $run.Count, $s.Name, ($s.Args -join ' '), ($extra -join ' ')).TrimEnd()
    # Build the argv carefully: PS array + $null grows the array by a null
    # element, which node would see as an empty-string argument.
    $cmdArgs = @()
    foreach ($a in $extra) { if ($a) { $cmdArgs += $a } }
    foreach ($a in @($s.Args | Select-Object -Skip 1)) { if ($a) { $cmdArgs += $a } }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & node (Join-Path $BaseDir $s.Args[0]) @cmdArgs
    if ($LASTEXITCODE -ne 0) {
        $failed += $s.Name
        Write-Step ("FAILED (exit $LASTEXITCODE) - continuing with the rest")
    } else {
        Write-Step ("ok ({0:N0}s)" -f $sw.Elapsed.TotalSeconds)
    }
    Write-Host ''
}

Write-Host ('-' * 62)
Write-Host ("Done: {0} ok, {1} skipped, {2} failed." -f ($run.Count - $skipped.Count - $failed.Count), $skipped.Count, $failed.Count)
if ($skipped.Count) { Write-Host ("  skipped: " + ($skipped -join ', ')) }
if ($failed.Count)  { Write-Host ("  failed:  " + ($failed -join ', ')) }
Write-Host ''
Write-Host 'Verify with:  node tools\run-tests.js   (all green before shipping)'
Write-Host 'Then restart the dashboard (the page reads these files at load time).'
