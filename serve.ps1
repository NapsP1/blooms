# Runs Bloom on your computer at http://localhost:8080 so you can try it.
param([int]$Port = 8080)

$root = [IO.Path]::GetFullPath($PSScriptRoot)
$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.webmanifest' = 'application/manifest+json'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Bloom is running at http://localhost:$Port/"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
  if ($path -eq '') { $path = 'index.html' }
  $full = [IO.Path]::GetFullPath((Join-Path $root $path))
  if ($full.StartsWith($root) -and (Test-Path $full -PathType Leaf)) {
    $bytes = [IO.File]::ReadAllBytes($full)
    $type = $types[[IO.Path]::GetExtension($full)]
    if (-not $type) { $type = 'application/octet-stream' }
    $ctx.Response.ContentType = $type
    $ctx.Response.Headers.Add('Cache-Control', 'no-cache')
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
