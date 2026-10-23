# Exercise the production NSIS directory transaction with private installation directories.
param(
  [Parameter(Mandatory)][string]$Makensis,
  [Parameter(Mandatory)][string]$SevenZip,
  [string]$FrameLibrary,
  [scriptblock]$SignExecutable
)
$ErrorActionPreference = 'Stop'
$Makensis = [System.IO.Path]::GetFullPath($Makensis)
$SevenZip = [System.IO.Path]::GetFullPath($SevenZip)
if ($FrameLibrary) { $FrameLibrary = [System.IO.Path]::GetFullPath($FrameLibrary) }
$scratch = [System.IO.Directory]::CreateTempSubdirectory('dsh-directory-smoke-').FullName
$fixture = Join-Path $PSScriptRoot '../tests/fixtures/installer-directory-smoke.nsi'
. (Join-Path $PSScriptRoot '../tests/windows-installer-ui.ps1')

function Invoke-Checked([string]$Executable, [string[]]$Arguments) {
  & $Executable @Arguments | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "$Executable exited with $LASTEXITCODE" }
}

try {
  $payload = Join-Path $scratch 'payload'
  New-Item -ItemType Directory -Path $payload | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $payload 'asset.txt'), 'new asset')
  $deepPayload = Join-Path $payload (('nested-' * 20) + '\asset-' + ('x' * 60) + '.txt')
  [IO.Directory]::CreateDirectory((Split-Path $deepPayload -Parent)) | Out-Null
  [IO.File]::WriteAllText($deepPayload, 'long path asset')
  $archive = Join-Path $scratch 'payload.7z'
  Invoke-Checked $SevenZip @('a', '-bd', '-t7z', $archive, "$payload/*")
  $brokenArchive = Join-Path $scratch 'broken.7z'
  [System.IO.File]::WriteAllText($brokenArchive, 'invalid archive')

  foreach ($mode in @('first', 'upgrade', 'transient-lock', 'locked', 'locked-stage', 'retry', 'cancel-lock', 'missing-stage', 'broken', 'cancelled')) {
    $caseRoot = Join-Path $scratch $mode
    $target = Join-Path $caseRoot 'Application'
    New-Item -ItemType Directory -Path $caseRoot | Out-Null
    if ($mode -ne 'first') {
      New-Item -ItemType Directory -Path $target | Out-Null
      [System.IO.File]::WriteAllText((Join-Path $target 'asset.txt'), 'old asset')
      [System.IO.File]::WriteAllText((Join-Path $target 'obsolete.txt'), 'old only')
      $oldDeep = Join-Path $target ([IO.Path]::GetRelativePath($payload, $deepPayload))
      [IO.Directory]::CreateDirectory((Split-Path $oldDeep -Parent)) | Out-Null
      [IO.File]::WriteAllText($oldDeep, 'old long path asset')
    }
    $probe = Join-Path $caseRoot 'probe.exe'
    $caseArchive = if ($mode -eq 'broken') { $brokenArchive } else { $archive }
    $reportDir = Join-Path $caseRoot 'installer-logs'
    $compileArgs = @('/WX', '/V2', "/DOUTPUT_FILE=$probe", "/DPAYLOAD_FILE=$caseArchive", "/DTARGET_DIR=$target", "/DDSH_SEVENZIP_PATH=$SevenZip", "/DREPORT_DIR=$reportDir")
    if ($FrameLibrary) { $compileArgs += "/DSOURCE_DLL=$FrameLibrary" }
    if ($mode -eq 'locked-stage') { $compileArgs += '/DLOCKED_STAGE' }
    if ($mode -in @('retry', 'cancel-lock')) { $compileArgs += '/DINTERACTIVE' }
    if ($mode -eq 'missing-stage') { $compileArgs += '/DMISSING_STAGE' }
    if ($mode -eq 'cancelled') { $compileArgs += '/DCANCELLED' }
    Invoke-Checked $Makensis ($compileArgs + $fixture)
    if ($null -ne $SignExecutable) { & $SignExecutable $probe }
    $handle = $null
    $process = $null
    try {
      if ($mode -in @('transient-lock', 'locked', 'retry', 'cancel-lock')) {
        $handle = [System.IO.File]::Open((Join-Path $target 'asset.txt'), 'Open', 'Read', 'Read')
      }
      $start = @{ FilePath = $probe; PassThru = $true }
      if ($mode -notin @('retry', 'cancel-lock')) { $start.ArgumentList = '/S' }
      $process = Start-Process @start
      if ($mode -eq 'transient-lock') {
        $timer = [Diagnostics.Stopwatch]::StartNew()
        do {
          $observed = @(if (Test-Path -LiteralPath $reportDir) { Get-ChildItem -LiteralPath $reportDir -Filter 'directory-failure-*.log' | Where-Object { (Get-Content -LiteralPath $_.FullName -Raw -Encoding Unicode) -match 'Windows error: (5|32|33)' } })
          if ($process.HasExited -or $timer.Elapsed.TotalSeconds -gt 30) { throw 'Locked move was not observed before release' }
          if ($observed.Count -eq 0) { Start-Sleep -Milliseconds 25 }
        } while ($observed.Count -eq 0)
        $handle.Dispose(); $handle = $null
      }
      if ($mode -eq 'locked-stage') {
        $timer = [Diagnostics.Stopwatch]::StartNew()
        do {
          $staged = @(Get-ChildItem -LiteralPath $caseRoot -Directory -Filter 'Application.new-*' | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'stage-ready.txt') })
          if ($process.HasExited -or $timer.Elapsed.TotalSeconds -gt 30) { throw 'Staged lock handshake did not become ready' }
          if ($staged.Count -eq 0) { Start-Sleep -Milliseconds 25 }
        } while ($staged.Count -eq 0)
        $handle = [IO.File]::Open((Join-Path $staged[0].FullName 'asset.txt'), 'Open', 'Read', 'Read')
        Remove-Item -LiteralPath (Join-Path $staged[0].FullName 'stage-ready.txt')
      }
      if ($mode -in @('retry', 'cancel-lock')) {
        $timer = [Diagnostics.Stopwatch]::StartNew()
        do {
          $control = [InstallerCapture]::FindText($process.Id, 'Windows error:')
          if ($process.HasExited -or $timer.Elapsed.TotalSeconds -gt 30) { throw 'Directory failure dialog did not appear' }
          if ($control -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 25 }
        } while ($control -eq [IntPtr]::Zero)
        $dialog = [InstallerCapture]::TopLevel($control)
        $text = [InstallerCapture]::VisibleText($process.Id)
        if ($text -match 'cannot be closed' -or $text -notmatch 'Windows error: (5|32|33)') { throw "Wrong directory failure: $text" }
        if (-not [InstallerCapture]::IsWindowVisible([InstallerCapture]::GetDlgItem($dialog, 4))) { throw 'Retry button is missing' }
        if ($mode -eq 'retry') { $handle.Dispose(); $handle = $null }
        $button = if ($mode -eq 'retry') { 4 } else { 2 }
        [InstallerCapture]::Click([InstallerCapture]::GetDlgItem($dialog, $button))
      }
      if (-not $process.WaitForExit(60000)) {
        $process.Kill($true)
        $process.WaitForExit()
        throw "Directory smoke $mode did not exit within 60 seconds"
      }
      $expectedExit = if ($mode -in @('first', 'upgrade', 'transient-lock', 'retry')) { 0 } else { 2 }
      if ($process.ExitCode -ne $expectedExit) {
        throw "Directory smoke $mode exited with $($process.ExitCode), expected $expectedExit"
      }
    } finally {
      if ($null -ne $handle) { $handle.Dispose() }
      if ($null -ne $process) {
        if (-not $process.HasExited) { $process.Kill($true); $process.WaitForExit() }
        $process.Dispose()
      }
    }
    $expectedAsset = if ($mode -in @('first', 'upgrade', 'transient-lock', 'retry')) { 'new asset' } else { 'old asset' }
    if ([System.IO.File]::ReadAllText((Join-Path $target 'asset.txt')) -ne $expectedAsset) {
      throw "Directory smoke $mode changed the wrong version"
    }
    $expectObsolete = $mode -notin @('first', 'upgrade', 'transient-lock', 'retry')
    if ((Test-Path -LiteralPath (Join-Path $target 'obsolete.txt')) -ne $expectObsolete) {
      throw "Directory smoke $mode did not preserve the expected old-only file state"
    }
    # A locked staged file may prevent rollback cleanup; it must never replace the old version.
    $stagingResidue = @(Get-ChildItem -LiteralPath $caseRoot -Directory -Filter 'Application.new-*')
    if ($mode -eq 'locked-stage') { $stagingResidue | Remove-Item -Recurse -Force }
    if (@(Get-ChildItem -LiteralPath $caseRoot -Directory | Where-Object Name -notin @('Application', 'installer-logs')).Count -ne 0) {
      throw "Directory smoke $mode left transaction directories behind"
    }
    $directoryReports = @(if (Test-Path -LiteralPath $reportDir) { Get-ChildItem -LiteralPath $reportDir -Filter 'directory-failure-*.log' })
    if ($mode -in @('transient-lock', 'locked', 'locked-stage', 'retry', 'cancel-lock', 'missing-stage')) {
      if ($directoryReports.Count -ne 1) { throw "Directory smoke $mode did not save its failure report" }
      $report = Get-Content -LiteralPath $directoryReports[0].FullName -Raw -Encoding Unicode
      $operation = if ($mode -in @('locked-stage', 'missing-stage')) { 'promote-installation' } else { 'backup-installation' }
      if (-not $report.Contains("Operation: $operation") -or -not $report.Contains("Installation: $target")) { throw "Directory smoke $mode report lacks operation and path" }
      if ($mode -eq 'locked-stage' -and $report -notmatch 'Operation: restore-backup[\s\S]*Windows error: 0') { throw 'Promotion failure did not report successful restoration' }
    } elseif ($directoryReports.Count -ne 0) { throw "Unexpected directory report for $mode" }
    if ($FrameLibrary) {
      # Only an extraction failure writes a report; it must quote 7-Zip's verdict so support can read the cause.
      $reports = @(if (Test-Path -LiteralPath $reportDir) { Get-ChildItem -LiteralPath $reportDir -Filter 'extract-failure-*.log' -File })
      if ($mode -eq 'broken') {
        if ($reports.Count -ne 1 -or $reports[0].Name -notmatch '^extract-failure-20\d{6}-\d{6}\.log$') {
          throw "Directory smoke $mode did not save exactly one extraction report"
        }
        $report = Get-Content -LiteralPath $reports[0].FullName -Raw -Encoding UTF8
        foreach ($expected in @('Result: 7-Zip exit code 2 (fatal error)', "Archive: $caseArchive", 'Cannot open the file as [7z] archive')) {
          if (-not $report.Contains($expected)) { throw "Directory smoke $mode report lacks '$expected'" }
        }
      } elseif ($reports.Count -ne 0) {
        throw "Directory smoke $mode saved an unexpected extraction report"
      }
    }
    Write-Output "Directory replacement smoke passed: $mode"
  }
} catch {
  Get-ChildItem -LiteralPath $scratch -Recurse -Filter 'directory-failure-*.log' | ForEach-Object {
    Write-Output $_.FullName
    Get-Content -LiteralPath $_.FullName -Raw -Encoding Unicode | Write-Output
  }
  throw
} finally {
  $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  $resolvedScratch = [System.IO.Path]::GetFullPath($scratch)
  if (-not $resolvedScratch.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing cleanup outside the temporary root: $resolvedScratch"
  }
  Remove-Item -LiteralPath $resolvedScratch -Recurse -Force
}
