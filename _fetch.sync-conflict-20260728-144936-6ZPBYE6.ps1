$root = Join-Path $env:TEMP 'bridgesrc\fork-v11\launcher-11'
Write-Output "=== AndroidManifest.xml (permissions/queries/home intent) ==="
Get-Content (Join-Path $root 'app\src\main\AndroidManifest.xml') |
  Select-String -Pattern 'uses-permission|<queries|</queries|intent-filter|category|action android|package android:name|<application' |
  ForEach-Object { $_.Line.Trim() }
Write-Output ""
Write-Output "=== app/build.gradle(.kts) sdk + version ==="
Get-ChildItem (Join-Path $root 'app') -Filter 'build.gradle*' | ForEach-Object {
  Write-Output ("--- " + $_.Name)
  Get-Content $_.FullName | Select-String -Pattern 'minSdk|targetSdk|compileSdk|versionCode|versionName|jvmTarget|sourceCompat' | ForEach-Object { $_.Line.Trim() }
}
Write-Output ""
Write-Output "=== gradle wrapper ==="
Get-Content (Join-Path $root 'gradle\wrapper\gradle-wrapper.properties') | Select-String 'distributionUrl' | ForEach-Object { $_.Line.Trim() }
Write-Output ""
Write-Output "=== master(v8) vs v11 BridgeWebViewClient diff-ish ==="
$m = Join-Path $env:TEMP 'bridgesrc\fork-master-v8\launcher-master\app\src\main\java\com\tored\bridgelauncher\api2\webview\BridgeWebViewClient.kt'
if (Test-Path $m) {
  $a = Get-Content $m
  $b = Get-Content (Join-Path $root 'app\src\main\java\com\tored\bridgelauncher\api2\webview\BridgeWebViewClient.kt')
  $d = Compare-Object $a $b
  if ($d) { $d | ForEach-Object { "{0} {1}" -f $_.SideIndicator, $_.InputObject } } else { Write-Output "identical" }
} else { Write-Output "master copy not found" }
