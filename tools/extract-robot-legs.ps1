param([string]$Source)
Add-Type -AssemblyName System.Drawing
$root=Split-Path $PSScriptRoot -Parent
$art=Join-Path $root 'versions/0.1.0/dev-support/art/enemies'
if ($Source) { Copy-Item -LiteralPath $Source -Destination (Join-Path $art 'robot-legs-source.png') }
$b=[Drawing.Bitmap]::new((Join-Path $art 'robot-legs-source.png'))
try {
 $colors=@('magenta','teal','blue','gold');$cuts=@(0,620,1100,1580,$b.Width);$pivots=@(375,865,1350,1825);$parts=@()
 for($i=0;$i -lt 4;$i++){
 $left=$cuts[$i+1];$right=0;$top=$b.Height;$bottom=0
 for($y=370;$y -lt $b.Height;$y++){for($x=$cuts[$i];$x -lt $cuts[$i+1];$x++){if($b.GetPixel($x,$y).A -gt 0){$left=[Math]::Min($left,$x);$right=[Math]::Max($right,$x);$top=[Math]::Min($top,$y);$bottom=[Math]::Max($bottom,$y)}}}
 $rect=[Drawing.Rectangle]::new($left-2,$top-2,$right-$left+5,$bottom-$top+5)
 $part=$b.Clone($rect,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
 try{$part.Save((Join-Path $root "assets/images/enemies/legs-$($colors[$i]).png"),[Drawing.Imaging.ImageFormat]::Png)}finally{$part.Dispose()}
 $pivotY=if($i -ge 2){50}else{20}
 $parts+=@{color=$colors[$i];width=$rect.Width;height=$rect.Height;pivot=@{x=$pivots[$i]-$rect.X;y=$pivotY};scale=347.0/($rect.Height-$pivotY)}
 }
 $parts | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $art 'robot-legs-extraction.json')
}finally{$b.Dispose()}
