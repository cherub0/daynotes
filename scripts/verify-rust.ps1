$ErrorActionPreference = "Stop"

$vsPath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
$msvcVer = (Get-ChildItem "$vsPath\VC\Tools\MSVC" -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
$msvcBin = "$vsPath\VC\Tools\MSVC\$msvcVer\bin\Hostx64\x64"
$kitsDir = "C:\Program Files (x86)\Windows Kits\10"
$kitsVer = (Get-ChildItem "$kitsDir\include" -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name

$env:PATH = "$msvcBin;$env:PATH"
$env:LIB = "$vsPath\VC\Tools\MSVC\$msvcVer\lib\x64;$kitsDir\lib\$kitsVer\ucrt\x64;$kitsDir\lib\$kitsVer\um\x64"
$env:INCLUDE = "$vsPath\VC\Tools\MSVC\$msvcVer\include;$kitsDir\include\$kitsVer\ucrt;$kitsDir\include\$kitsVer\um;$kitsDir\include\$kitsVer\shared"

cargo test --manifest-path src-tauri\Cargo.toml
