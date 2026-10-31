param([string]$BodySource, [string]$RotorSource)
Add-Type -AssemblyName System.Drawing
$colors=@('magenta','teal','blue','gold'); $centers=@(284,744,1194,1654)
if (!$BodySource) { $BodySource=Join-Path $PSScriptRoot '../versions/0.1.0/dev-support/art/enemies/healer-body-source.png' }
$body=[Drawing.Bitmap]::new($BodySource)
if (!$RotorSource) { $RotorSource=Join-Path $PSScriptRoot '../versions/0.1.0/dev-support/art/enemies/healer-rotor-source.png' }
$rotor=[Drawing.Bitmap]::new($RotorSource)
try { for($i=0;$i -lt 4;$i++) {
 foreach($part in @('healer','rotor')) {
 if($part -eq 'healer') { $src=$body; $rect=[Drawing.Rectangle]::new($centers[$i]-116,490,232,204) } else { $src=$rotor; $rect=[Drawing.Rectangle]::new($centers[$i]-176,365,384,166) }
 $crop=$src.Clone($rect,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
 try { $crop.Save((Join-Path $PWD "assets/images/enemies/$part-$($colors[$i]).png"),[Drawing.Imaging.ImageFormat]::Png) } finally { $crop.Dispose() }
 }
} } finally { $body.Dispose(); $rotor.Dispose() }
