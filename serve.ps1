param(
  [int]$Port = 8080,
  [string]$Root = (Get-Location).Path,
  [switch]$Open
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ContentType([string]$path){
  $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
  $map = @{
    '.html'='text/html; charset=utf-8';
    '.htm'='text/html; charset=utf-8';
    '.css'='text/css; charset=utf-8';
    '.js'='application/javascript; charset=utf-8';
    '.mjs'='application/javascript; charset=utf-8';
    '.json'='application/json; charset=utf-8';
    '.map'='application/json; charset=utf-8';
    '.svg'='image/svg+xml; charset=utf-8';
    '.txt'='text/plain; charset=utf-8';
    '.xml'='application/xml; charset=utf-8';
    '.png'='image/png';
    '.jpg'='image/jpeg';
    '.jpeg'='image/jpeg';
    '.gif'='image/gif';
    '.webp'='image/webp';
    '.ico'='image/x-icon';
    '.pdf'='application/pdf';
    '.woff'='font/woff';
    '.woff2'='font/woff2';
    '.ttf'='font/ttf';
    '.otf'='font/otf';
    '.eot'='application/vnd.ms-fontobject';
    '.mp4'='video/mp4';
    '.webm'='video/webm';
    '.ogv'='video/ogg';
    '.mp3'='audio/mpeg';
    '.wav'='audio/wav';
    '.m4a'='audio/mp4';
  }
  if($map.ContainsKey($ext)){
    return $map[$ext]
  } else {
    return 'application/octet-stream'
  }
}

function Write-Bytes([System.Net.HttpListenerResponse]$res, [byte[]]$bytes, [string]$contentType){
  $res.ContentType = $contentType
  $res.AddHeader('Cache-Control','no-cache')
  $res.AddHeader('Access-Control-Allow-Origin','*')
  $res.ContentLength64 = $bytes.LongLength
  $output = $res.OutputStream
  try { $output.Write($bytes,0,$bytes.Length) } finally { $output.Close() }
}

function Write-String([System.Net.HttpListenerResponse]$res, [string]$text, [string]$contentType){
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  Write-Bytes $res $bytes $contentType
}

function Html-Encode([string]$s){
  # Prefer System.Net.WebUtility for compatibility across PowerShell versions
  return [System.Net.WebUtility]::HtmlEncode($s)
}

$rootFull = [IO.Path]::GetFullPath((Join-Path $Root '.'))
if(-not (Test-Path $rootFull -PathType Container)){
  throw "Root path not found: $Root"
}

$listener = [System.Net.HttpListener]::new()
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $rootFull at $prefix (Ctrl+C to stop)" -ForegroundColor Green
if($Open){ Start-Process $prefix }

try {
  while($listener.IsListening){
    $context = $listener.GetContext()
    try{
      $req = $context.Request
      $res = $context.Response

        $method = $req.HttpMethod.ToUpperInvariant()
        if($method -ne 'GET' -and $method -ne 'HEAD'){
          $res.StatusCode = 405
          $res.AddHeader('Allow','GET, HEAD')
          [void]$res.OutputStream.Close(); return
        }

      $absPath = $req.Url.AbsolutePath

      # Handle simple POST endpoints for demo forms
      if($method -eq 'POST'){
        $p = $absPath.ToLowerInvariant()
        if($p -eq '/login' -or $p -eq '/register'){
          $res.StatusCode = 303
          $res.AddHeader('Location','/index.html')
          Write-String $res "<meta charset='utf-8'><meta http-equiv='refresh' content='0;url=/index.html'><p>提交成功（演示）。正在跳转到首页…</p>" 'text/html; charset=utf-8'
          continue
        } elseif($p -eq '/verify'){
          $res.StatusCode = 200
          Write-String $res '{"ok":true}' 'application/json; charset=utf-8'
          continue
        } else {
          $res.StatusCode = 405
          $res.AddHeader('Allow','GET, HEAD, POST')
          $res.Close()
          continue
        }
      }

      $rawPath = [uri]::UnescapeDataString($absPath)
      if($rawPath.StartsWith('/')){ $rawPath = $rawPath.Substring(1) }
      if([string]::IsNullOrWhiteSpace($rawPath)) { $rawPath = '' }

      # Root redirect to login.html
      if($rawPath -eq ''){
        $res.StatusCode = 302
        $res.AddHeader('Location','/login.html')
        if($method -eq 'HEAD'){ $res.Close(); continue }
        Write-String $res '<a href="/login.html">Redirecting to /login.html</a>' 'text/html; charset=utf-8'
        continue
      }

      $target = [IO.Path]::GetFullPath([IO.Path]::Combine($rootFull, $rawPath))
      if(-not $target.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)){
        $res.StatusCode = 403
        Write-String $res '<h1>403 Forbidden</h1>' 'text/html; charset=utf-8'
        continue
      }

      $serveFile = $null
      if((Test-Path $target -PathType Container)){
        $indexPath = Join-Path $target 'index.html'
        if(Test-Path $indexPath -PathType Leaf){
          $serveFile = $indexPath
        } else {
          # Directory listing
          $items = Get-ChildItem -LiteralPath $target -Force | Sort-Object Name
          $rel = ''
          if(-not [string]::IsNullOrEmpty($rawPath)){
            $rel = $rawPath.TrimEnd('/') + '/'
          }
          $links = $items | ForEach-Object {
            $name = $_.Name
            $href = ($rel + $name)
            if($_.PSIsContainer){ $href += '/' }
            "<li><a href='/$([System.Web.HttpUtility]::UrlPathEncode($href))'>$(Html-Encode $name)</a></li>"
          } | Out-String
          $html = @"
<!doctype html>
<meta charset='utf-8'>
<title>Index of /$rel</title>
<style>body{font-family:Segoe UI,Arial;max-width:760px;margin:40px auto;padding:0 16px;color:#111} h1{font-size:20px;margin-bottom:12px} ul{line-height:1.8}</style>
<h1>Index of /$(Html-Encode $rel)</h1>
<ul>
$links
</ul>
"@
          $res.StatusCode = 200
          if($method -eq 'HEAD'){ $res.Close(); continue }
          Write-String $res $html 'text/html; charset=utf-8'
          continue
        }
      } elseif(-not (Test-Path $target -PathType Leaf)){
        # fallback: try append .html for convenience
        $tryHtml = "$target.html"
        if(Test-Path $tryHtml -PathType Leaf){ $serveFile = $tryHtml }
      }

      if(-not $serveFile){
        if(Test-Path $target -PathType Leaf){ $serveFile = $target }
      }

      if(-not $serveFile){
        $res.StatusCode = 404
        $msg = '<h1>404 Not Found</h1><p>The requested resource was not found.</p>'
        if($method -eq 'HEAD'){ $res.Close(); continue }
        Write-String $res $msg 'text/html; charset=utf-8'
        continue
      }

      try{
        $bytes = [IO.File]::ReadAllBytes($serveFile)
        $res.StatusCode = 200
        if($method -eq 'HEAD'){ $res.Close(); continue }
        Write-Bytes $res $bytes (Get-ContentType $serveFile)
      } catch {
        $res.StatusCode = 500
        $err = (Html-Encode $_.Exception.Message)
        $html = "<h1>500 Internal Server Error</h1><pre>$err</pre>"
        if($method -eq 'HEAD'){ $res.Close(); continue }
        Write-String $res $html 'text/html; charset=utf-8'
      }
    } catch {
      try{ $context.Response.StatusCode = 500; $context.Response.Close() } catch {}
    }
  }
}
finally{
  if($listener){ $listener.Stop(); $listener.Close() }
}
