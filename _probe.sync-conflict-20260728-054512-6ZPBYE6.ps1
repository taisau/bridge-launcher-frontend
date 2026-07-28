$targets = @(
  @{Host='100.93.179.65'; Port=8022; Name='phone (termux sshd)'},
  @{Host='100.121.57.47'; Port=22;   Name='framework host'},
  @{Host='100.121.57.47'; Port=8384; Name='framework syncthing'}
)
foreach ($t in $targets) {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $r = $c.BeginConnect($t.Host, $t.Port, $null, $null)
    $ok = $r.AsyncWaitHandle.WaitOne(3000, $false)
    if ($ok) { try { $c.EndConnect($r); $ok = $true } catch { $ok = $false } }
  } catch { $ok = $false }
  finally { $c.Close() }
  Write-Output ("{0,-24} {1}:{2} reachable={3}" -f $t.Name, $t.Host, $t.Port, $ok)
}
Write-Output "--- tailscale ---"
$ts = Get-Command tailscale -ErrorAction SilentlyContinue
if ($ts) { & tailscale status 2>&1 | Select-Object -First 15 } else { Write-Output "tailscale CLI not found on PATH" }
