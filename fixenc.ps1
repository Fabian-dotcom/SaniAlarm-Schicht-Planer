$ErrorActionPreference = 'Stop'
$datei = 'app\src\main\java\com\fabian\sanialarmplaner\ui\WeitereTabs.kt'
$bytes = [System.IO.File]::ReadAllBytes($datei)
$text = [System.Text.Encoding]::UTF8.GetString($bytes)

# Mojibake-Paare: falsch (2 chars) -> richtig (1 char)
$swap = New-Object System.Collections.Generic.List[object]
$swap.Add(@($([string][char]0xC3 + [string][char]0xA4), $([string][char]0xE4)))
$swap.Add(@($([string][char]0xC3 + [string][char]0xB6), $([string][char]0xF6)))
$swap.Add(@($([string][char]0xC3 + [string][char]0xBC), $([string][char]0xFC)))
$swap.Add(@($([string][char]0xC3 + [string][char]0x84), $([string][char]0xC4)))
$swap.Add(@($([string][char]0xC3 + [string][char]0x96), $([string][char]0xD6)))
$swap.Add(@($([string][char]0xC3 + [string][char]0x9C), $([string][char]0xDC)))
$swap.Add(@($([string][char]0xC3 + [string][char]0x9F), $([string][char]0xDF)))
foreach ($p in $swap) { $text = $text.Replace($p[0], $p[1]) }

# Doppel-Byte-Sequenzen (3 chars mojibake) -> echte Zeichen
$map2 = New-Object System.Collections.Generic.List[object]
$map2.Add(@($([string][char]0xC3 + [string][char]0xA2 + [string][char]0x80 + [string][char]0x93), $([string][char]0x2013)))
$map2.Add(@($([string][char]0xC3 + [string][char]0xA2 + [string][char]0x80 + [string][char]0x94), $([string][char]0x2014)))
$map2.Add(@($([string][char]0xC3 + [string][char]0xA2 + [string][char]0x86 + [string][char]0x92), $([string][char]0x2192)))
$map2.Add(@($([string][char]0xC3 + [string][char]0xA2 + [string][char]0x80 + [string][char]0x9E), $([string][char]0x201E)))
$map2.Add(@($([string][char]0xC3 + [string][char]0xA2 + [string][char]0x80 + [string][char]0x9C), $([string][char]0x201C)))
$map2.Add(@($([string][char]0xC3 + [string][char]0xA2 + [string][char]0x80 + [string][char]0x9D), $([string][char]0x201D)))
foreach ($p in $map2) { $text = $text.Replace($p[0], $p[1]) }

[System.IO.File]::WriteAllText($datei, $text, (New-Object System.Text.UTF8Encoding($false)))
'Fixed.'
