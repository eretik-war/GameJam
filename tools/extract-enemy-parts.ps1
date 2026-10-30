param([string]$CameraSource, [string]$LegSource)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path $PSScriptRoot -Parent
$referenceRoot = Join-Path $projectRoot 'versions/0.1.0/dev-support/art/enemies'
$outputRoot = Join-Path $projectRoot 'assets/images/enemies'
New-Item -ItemType Directory -Force -Path $referenceRoot, $outputRoot | Out-Null
if ($CameraSource) { Copy-Item -LiteralPath $CameraSource -Destination (Join-Path $referenceRoot 'camera-source.png') }
if ($LegSource) { Copy-Item -LiteralPath $LegSource -Destination (Join-Path $referenceRoot 'leg-source.png') }
function Export-Part($bitmap, [string]$name, [System.Drawing.Rectangle]$region) {
    $left = $region.Right; $top = $region.Bottom; $right = -1; $bottom = -1
    for ($y = $region.Top; $y -lt $region.Bottom; $y++) {
        for ($x = $region.Left; $x -lt $region.Right; $x++) {
            if ($bitmap.GetPixel($x, $y).A -gt 0) {
                $left = [Math]::Min($left, $x); $top = [Math]::Min($top, $y)
                $right = [Math]::Max($right, $x); $bottom = [Math]::Max($bottom, $y)
            }
        }
    }
    if ($right -lt 0) { throw "Empty part: $name" }
    # A common padded camera canvas keeps the rig's sockets identical for all four colors.
    if ($name -like 'camera-*') { $crop = [System.Drawing.Rectangle]::new($region.Left, 244, 232, 164) }
    else { $crop = [System.Drawing.Rectangle]::new($left - 2, $top - 2, $right - $left + 5, $bottom - $top + 5) }
    $part = $bitmap.Clone($crop, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        for ($y = 0; $y -lt $crop.Height; $y++) {
            for ($x = 0; $x -lt $crop.Width; $x++) {
                if ($part.GetPixel($x, $y).ToArgb() -ne $bitmap.GetPixel($crop.X + $x, $crop.Y + $y).ToArgb()) { throw "Pixel mismatch: $name at $x,$y" }
            }
        }
        $part.Save((Join-Path $outputRoot "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally { $part.Dispose() }
    [pscustomobject]@{ name = $name; crop = [ordered]@{ x = $crop.X; y = $crop.Y; width = $crop.Width; height = $crop.Height }; alphaBounds = [ordered]@{ left = $left; top = $top; right = $right; bottom = $bottom } }
}
$cameras = [System.Drawing.Bitmap]::new((Join-Path $referenceRoot 'camera-source.png'))
$leg = [System.Drawing.Bitmap]::new((Join-Path $referenceRoot 'leg-source.png'))
try {
    $parts = @(
        Export-Part $cameras 'camera-magenta' ([System.Drawing.Rectangle]::new(196, 220, 232, 200))
        Export-Part $cameras 'camera-teal' ([System.Drawing.Rectangle]::new(586, 220, 232, 200))
        Export-Part $cameras 'camera-blue' ([System.Drawing.Rectangle]::new(1006, 220, 232, 200))
        Export-Part $cameras 'camera-gold' ([System.Drawing.Rectangle]::new(1406, 220, 232, 200))
        Export-Part $leg 'shooter-leg' ([System.Drawing.Rectangle]::new(0, 0, $leg.Width, $leg.Height))
    )
    $parts | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $referenceRoot 'extraction.json')
    $parts | ConvertTo-Json -Depth 5
} finally { $cameras.Dispose(); $leg.Dispose() }
