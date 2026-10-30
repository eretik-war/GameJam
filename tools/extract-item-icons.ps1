param([string]$PreparedSheet)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path $PSScriptRoot -Parent
$artRoot = Join-Path $projectRoot 'versions/0.1.0/dev-support/art/items'
$outputRoot = Join-Path $projectRoot 'assets/images/items'
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
if (!$PreparedSheet) { $PreparedSheet = Join-Path $artRoot 'prepared-sheet.png' }
$sheet = [System.Drawing.Bitmap]::new($PreparedSheet)
# Existing desktop slots are at least 64 CSS px: export at 2x, without changing slot geometry.
$size = 128; $padding = 4
$names = @('magenta', 'teal', 'blue', 'gold')
try {
    $parts = for ($index = 0; $index -lt 4; $index++) {
        $regionX = [int][Math]::Floor(($index % 2) * $sheet.Width / 2)
        $regionY = [int][Math]::Floor([Math]::Floor($index / 2) * $sheet.Height / 2)
        $regionRight = [int][Math]::Floor((($index % 2) + 1) * $sheet.Width / 2)
        $regionBottom = [int][Math]::Floor(([Math]::Floor($index / 2) + 1) * $sheet.Height / 2)
        $left = $regionRight; $top = $regionBottom; $right = -1; $bottom = -1
        for ($y = $regionY; $y -lt $regionBottom; $y++) {
            for ($x = $regionX; $x -lt $regionRight; $x++) {
                if ($sheet.GetPixel($x, $y).A -ge 32) {
                    $left = [Math]::Min($left, $x); $top = [Math]::Min($top, $y)
                    $right = [Math]::Max($right, $x); $bottom = [Math]::Max($bottom, $y)
                }
            }
        }
        if ($right -lt 0) { throw "Empty item: $($names[$index])" }
        $crop = [System.Drawing.Rectangle]::new($left - 1, $top - 1, $right - $left + 3, $bottom - $top + 3)
        $part = $sheet.Clone($crop, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $output = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($output)
        try {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $scale = ($size - 2 * $padding) / [Math]::Max($part.Width, $part.Height)
            $width = [float]($part.Width * $scale); $height = [float]($part.Height * $scale)
            $target = [System.Drawing.RectangleF]::new(($size - $width) / 2, ($size - $height) / 2, $width, $height)
            $graphics.DrawImage($part, $target)
            # Remove residual 1-5% body transparency; retain antialiasing only at the silhouette.
            for ($y = 0; $y -lt $size; $y++) {
                for ($x = 0; $x -lt $size; $x++) {
                    $pixel = $output.GetPixel($x, $y)
                    if ($pixel.A -ge 240) { $output.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $pixel.R, $pixel.G, $pixel.B)) }
                }
            }
            $file = Join-Path $outputRoot "item-$($names[$index]).png"
            $output.Save($file, [System.Drawing.Imaging.ImageFormat]::Png)
            if ($output.GetPixel(64, 64).A -ne 255) { throw 'Item body must be opaque' }
            if ($output.GetPixel(0, 0).A -ne 0) { throw 'Item background must be transparent' }
            [pscustomobject]@{ name = $names[$index]; width = $size; height = $size; sourceCrop = $crop; bytes = (Get-Item -LiteralPath $file).Length; sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower() }
        } finally { $graphics.Dispose(); $output.Dispose(); $part.Dispose() }
    }
    $parts | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $artRoot 'extraction.json')
    $parts | Select-Object name, width, height, bytes, sha256 | ConvertTo-Json
} finally { $sheet.Dispose() }
