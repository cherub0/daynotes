$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "verify-output\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Write-LogLine {
    param([string]$Path, [string]$Line)
    [System.IO.File]::AppendAllText($Path, "$Line`r`n", $utf8)
    $Line | Write-Output
}

function Invoke-LoggedNpm {
    param(
        [Parameter(Mandatory = $true)][string]$LogName,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string[]]$Prelude = @()
    )

    $logPath = Join-Path $logDir $LogName
    [System.IO.File]::WriteAllText($logPath, "", $utf8)
    foreach ($line in $Prelude) { Write-LogLine -Path $logPath -Line $line }

    $command = "npm.cmd $($Arguments -join ' ') 2>&1"
    & cmd.exe /d /s /c $command | ForEach-Object {
        Write-LogLine -Path $logPath -Line "$_"
    }
    $exitCode = $LASTEXITCODE
    Write-LogLine -Path $logPath -Line "VERIFICATION_EXIT_CODE=$exitCode"
    if ($exitCode -ne 0) {
        throw "npm $($Arguments -join ' ') failed with exit code $exitCode"
    }
}

Push-Location $root
try {
    Invoke-LoggedNpm -LogName "frontend-tests.txt" -Arguments @("test")
    Invoke-LoggedNpm -LogName "lint.txt" -Arguments @("run", "lint")
    Invoke-LoggedNpm -LogName "build-bundle.txt" -Arguments @("run", "verify:bundle")
    Invoke-LoggedNpm -LogName "complete-ui.txt" -Arguments @("run", "verify:complete-ui")
    Invoke-LoggedNpm -LogName "rust-tests.txt" -Arguments @("run", "verify:rust")

    $vsPath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
    $msvcVer = (Get-ChildItem "$vsPath\VC\Tools\MSVC" -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    $msvcBin = "$vsPath\VC\Tools\MSVC\$msvcVer\bin\Hostx64\x64"
    $kitsDir = "C:\Program Files (x86)\Windows Kits\10"
    $kitsVer = (Get-ChildItem "$kitsDir\include" -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    $env:PATH = "$msvcBin;$env:PATH"
    $env:LIB = "$vsPath\VC\Tools\MSVC\$msvcVer\lib\x64;$kitsDir\lib\$kitsVer\ucrt\x64;$kitsDir\lib\$kitsVer\um\x64"
    $env:INCLUDE = "$vsPath\VC\Tools\MSVC\$msvcVer\include;$kitsDir\include\$kitsVer\ucrt;$kitsDir\include\$kitsVer\um;$kitsDir\include\$kitsVer\shared"
    $linkPath = (Get-Command link.exe).Source
    Invoke-LoggedNpm -LogName "tauri-build.txt" -Arguments @("run", "tauri:build") -Prelude @(
        "MSVC=$msvcVer",
        "WindowsKits=$kitsVer",
        "Link=$linkPath"
    )

    & npm.cmd run verify:evidence
    if ($LASTEXITCODE -ne 0) { throw "npm run verify:evidence failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}
