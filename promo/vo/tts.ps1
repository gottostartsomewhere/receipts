# Placeholder voiceover: reads promo/vo/script.json with a Windows voice (Ravi, Indian English)
# into promo/vo/tts/<id>.wav, one file per line. Replace with real recordings in promo/vo/real/.
#   powershell -ExecutionPolicy Bypass -File promo/vo/tts.ps1
param([string]$Voice = "Ravi", [double]$Rate = 1.0)
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$out = Join-Path $here "tts"
New-Item -ItemType Directory -Force $out | Out-Null

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Await($op, [Type]$type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$synth.Voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -like "*$Voice*" } | Select-Object -First 1
$synth.Options.SpeakingRate = $Rate
"voice: " + $synth.Voice.DisplayName

$lines = Get-Content (Join-Path $here "script.json") -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($l in $lines) {
  $stream = Await ($synth.SynthesizeTextToStreamAsync($l.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $n = Await ($reader.LoadAsync([uint32]$stream.Size)) ([uint32])
  $bytes = New-Object byte[] $n
  $reader.ReadBytes($bytes)
  [IO.File]::WriteAllBytes((Join-Path $out ($l.id + ".wav")), $bytes)
}
"wrote $($lines.Count) lines"
