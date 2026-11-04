# ============================================================
#  STREET CENSUS / Nebula Survey - local static file server
#  Pure Windows PowerShell (no Python required).
#  Supports HTTP Range requests (required for video seeking).
#  Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File server.ps1
# ============================================================
param(
  [int]$Port = 8643,
  [string]$PortFile = ""
)

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot

$Mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.mp4'  = 'video/mp4'
  '.txt'  = 'text/plain; charset=utf-8'
  '.woff2'= 'font/woff2'
}

# -- find a free port (8643 + up to 9 attempts) ------------------
$listener = $null
foreach ($p in $Port..($Port + 9)) {
  $try = New-Object System.Net.HttpListener
  $try.Prefixes.Add("http://127.0.0.1:$p/")
  try {
    $try.Start()
    $listener = $try
    $Port = $p
    break
  } catch { }
}
if (-not $listener) {
  Write-Output "ERROR: no free port in $Port - $($Port + 9)"
  exit 1
}
$Url = "http://127.0.0.1:$Port/"
if ($PortFile -ne '') {
  Set-Content -Path $PortFile -Value $Url -Encoding ascii
} else {
  Write-Output "serving $Root at $Url  (close this window to stop)"
}

# -- send one file (with Range support) --------------------------
function Send-File($ctx, $path) {
  $res = $ctx.Response
  $fs = $null
  try {
    $ext = [System.IO.Path]::GetExtension($path).ToLowerInvariant()
    if ($Mime.ContainsKey($ext)) { $res.ContentType = $Mime[$ext] }

    $len = (Get-Item -LiteralPath $path).Length
    $rng = $ctx.Request.Headers['Range']
    $start = -1
    $end = -1

    if ($rng -and $rng -match '^bytes=(\d*)-(\d*)') {
      $a = $Matches[1]
      $b = $Matches[2]
      if ($a -ne '') { $start = [long]$a }
      if ($b -ne '') { $end = [long]$b } else { $end = $len - 1 }
      if ($start -lt 0 -and $a -eq '') {
        # suffix form: bytes=-N  (last N bytes)
        $start = [Math]::Max(0, $len - [long]$b)
        $end = $len - 1
      }
      if ($end -ge $len) { $end = $len - 1 }
    }

    $res.Headers['Accept-Ranges'] = 'bytes'
    $fs = [System.IO.File]::OpenRead($path)

    if ($start -ge 0 -and $start -le $end) {
      $res.StatusCode = 206
      $res.Headers['Content-Range'] = "bytes $start-$end/$len"
      $count = $end - $start + 1
    } else {
      $res.StatusCode = 200
      $count = $len
    }
    $res.ContentLength64 = $count
    if ($start -gt 0) { $fs.Seek($start, 'Begin') | Out-Null }

    $buf = New-Object byte[] 65536
    while ($count -gt 0) {
      $n = $fs.Read($buf, 0, [Math]::Min($buf.Length, $count))
      if ($n -le 0) { break }
      $res.OutputStream.Write($buf, 0, $n)
      $count -= $n
    }
  } finally {
    if ($fs) { $fs.Close() }
  }
}

# -- request loop ------------------------------------------------
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $p = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    $rel = $p.TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $full = [System.IO.Path]::GetFullPath((Join-Path $Root ($rel.Replace('/', '\'))))

    # path must stay inside the project folder
    if (-not $full.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'forbidden path'
    }
    if ([System.IO.Directory]::Exists($full)) { $full = Join-Path $full 'index.html' }

    if ([System.IO.File]::Exists($full)) {
      Send-File $ctx $full
    } else {
      $res = $ctx.Response
      $res.StatusCode = 404
      $res.ContentType = 'text/plain; charset=utf-8'
      $bytes = [System.Text.Encoding]::UTF8.GetBytes('404 not found')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch {
    try { $ctx.Response.StatusCode = 500 } catch { }
  }
  try { $ctx.Response.OutputStream.Close() } catch { }
}
