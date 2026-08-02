param(
  [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$releaseDirectory = [IO.Path]::GetFullPath((Join-Path $repoRoot "releases"))
$archivePath = [IO.Path]::GetFullPath((Join-Path $releaseDirectory "Fortune-Avenue-Itchio-v$Version.zip"))

if (-not $releaseDirectory.StartsWith($repoRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Release directory escaped the repository."
}
if (-not $archivePath.StartsWith($releaseDirectory, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Archive path escaped the release directory."
}

$packageFiles = @(
  @{ Source = (Join-Path $PSScriptRoot "index.html"); Entry = "index.html" },
  @{ Source = (Join-Path $PSScriptRoot "README-UPLOAD.txt"); Entry = "README-UPLOAD.txt" },
  @{ Source = (Join-Path $repoRoot "web\public\cover.webp"); Entry = "assets/cover.webp" },
  @{ Source = (Join-Path $repoRoot "web\public\app-icon-512.png"); Entry = "assets/app-icon.png" }
)

foreach ($packageFile in $packageFiles) {
  if (-not (Test-Path -LiteralPath $packageFile.Source -PathType Leaf)) {
    throw "Missing package file: $($packageFile.Source)"
  }
}

New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($packageFile in $packageFiles) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive,
      $packageFile.Source,
      $packageFile.Entry,
      [IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
}
finally {
  $archive.Dispose()
}

$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $entries = @($archive.Entries)
  $entryNames = @($entries | ForEach-Object { $_.FullName })
  $expandedBytes = ($entries | Measure-Object -Property Length -Sum).Sum
  $largestFileBytes = ($entries | Measure-Object -Property Length -Maximum).Maximum
  $longestPath = ($entryNames | Measure-Object -Property Length -Maximum).Maximum

  if ($entryNames -notcontains "index.html") { throw "The package is missing index.html at its root." }
  if ($entryNames | Where-Object { $_ -match "\\" }) { throw "The package contains a non-portable path separator." }
  if ($entries.Count -gt 1000) { throw "The package exceeds itch.io's 1,000-file limit." }
  if ($longestPath -gt 240) { throw "A package path exceeds itch.io's 240-character limit." }
  if ($expandedBytes -gt 500MB) { throw "The package exceeds itch.io's 500 MB expanded-size limit." }
  if ($largestFileBytes -gt 200MB) { throw "A package file exceeds itch.io's 200 MB single-file limit." }
}
finally {
  $archive.Dispose()
}

Write-Output $archivePath
