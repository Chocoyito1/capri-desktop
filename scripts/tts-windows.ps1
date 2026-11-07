param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$data = Get-Content -LiteralPath $Request -Raw -Encoding UTF8 | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synth.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Female)
  $synth.SetOutputToWaveFile($data.output)
  $synth.Speak([string]$data.text)
} finally { $synth.Dispose() }
