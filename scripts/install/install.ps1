# Guided Zencast setup for Windows:
#   irm https://raw.githubusercontent.com/Noelithub77/zencast/master/scripts/install/install.ps1 | iex
# Finds the Zen profile, installs Sine with its official installer when missing, installs Zencast
# from the release branch, registers it for Sine's auto-updates and, with consent, turns on
# "Allow unsafe JS". Linux and macOS: install.sh beside this file.
# Saved locally: .\install.ps1 [-Profile <dir>] [-Yes] [-Uninstall]
# If Windows blocks a saved copy: powershell -ExecutionPolicy Bypass -File .\install.ps1

# Everything lives in one function so a partly downloaded script never runs.
function Install-Zencast {
  [CmdletBinding()]
  param(
    # $PROFILE is PowerShell's own variable, so the value lives in $ProfileDir.
    [Alias('Profile')]
    [string]$ProfileDir = '',
    [switch]$Yes,
    [switch]$Uninstall,
    [switch]$Help
  )

  $ErrorActionPreference = 'Stop'
  Set-StrictMode -Version Latest

  $repo = 'Noelithub77/zencast'
  $branch = 'release'
  $homepage = "https://github.com/$repo/tree/$branch"
  $modId = 'zencast'
  $failure = 'zencast-setup-stopped'

  # Glyphs come from char codes so this file stays ASCII and reads correctly in Windows PowerShell 5.1.
  $dot = [string][char]0x25CF
  $tick = [string][char]0x2713
  $cross = [string][char]0x2717
  $arrow = [string][char]0x203A

  $esc = [char]27
  $supportsVt = $false
  if ($null -ne $Host.UI) {
    $vt = $Host.UI.PSObject.Properties['SupportsVirtualTerminal']
    $supportsVt = ($null -ne $vt) -and [bool]$vt.Value
  }
  if ((-not [Console]::IsErrorRedirected) -and $supportsVt) {
    $bold = "${esc}[1m"
    $dim = "${esc}[2m"
    $peach = "${esc}[38;2;255;199;153m"
    $mint = "${esc}[38;2;153;255;228m"
    $rose = "${esc}[38;2;255;128;128m"
    $reset = "${esc}[0m"
  } else {
    $bold = ''
    $dim = ''
    $peach = ''
    $mint = ''
    $rose = ''
    $reset = ''
  }

  function Write-Title([string]$text) {
    Write-Host ''
    Write-Host ($bold + $peach + $text + $reset)
    Write-Host ''
  }

  function Write-Step([string]$label, [string]$detail) {
    Write-Host ('{0}{1}{2} {3,-9} {4}' -f $mint, $dot, $reset, $label, $detail)
  }

  function Write-Muted([string]$text) {
    Write-Host ($dim + $text + $reset)
  }

  function Write-Note([string]$text) {
    Write-Host ''
    Write-Host $text
  }

  function Write-Done([string]$text) {
    Write-Host ('{0}{1}{2} {3}' -f $mint, $tick, $reset, $text)
  }

  function Stop-Setup([string]$message) {
    Write-Host ('{0}{1}{2} {3}' -f $rose, $cross, $reset, $message)
    throw $failure
  }

  function Confirm-Answer([string]$question) {
    if ($Yes) { return $true }
    if ([Console]::IsInputRedirected) {
      Stop-Setup "No terminal to ask `"$question`"; rerun with -Yes or follow the README"
    }
    Write-Host ('{0}?{1} {2} [Y/n] ' -f $peach, $reset, $question) -NoNewline
    $answer = Read-Host
    return ($answer -eq '' -or $answer -match '^[Yy]')
  }

  function Wait-Enter([string]$prompt) {
    if ([Console]::IsInputRedirected) { return }
    Write-Host ('{0}{1}{2} {3} ' -f $peach, $arrow, $reset, $prompt) -NoNewline
    $null = Read-Host
  }

  function Show-Usage {
    Write-Host 'Usage: install.ps1 [-Profile <dir>] [-Yes] [-Uninstall]'
    Write-Host ''
    Write-Host '  -Profile <dir>  Zen profile to set up (default: ask, or the profile Zen opens by default)'
    Write-Host '  -Yes            Accept every prompt (installs Sine and turns on "Allow unsafe JS")'
    Write-Host '  -Uninstall      Remove Zencast from the profile'
  }

  function Test-Flag($value) {
    $text = [string]$value
    return ($text -ne '' -and $text -ne '0')
  }

  # ---------- profiles ----------

  function Get-ZenProfiles {
    if (-not $env:APPDATA) { return @() }
    $root = [IO.Path]::Combine($env:APPDATA, 'zen')
    $iniFile = [IO.Path]::Combine($root, 'profiles.ini')
    if (-not (Test-Path -LiteralPath $iniFile -PathType Leaf)) { return @() }

    $installDefault = ''
    $installsFile = [IO.Path]::Combine($root, 'installs.ini')
    if (Test-Path -LiteralPath $installsFile -PathType Leaf) {
      foreach ($line in [IO.File]::ReadAllLines($installsFile)) {
        if ($line -match '^Default=(.*)$') {
          $installDefault = $matches[1]
          break
        }
      }
    }

    $sections = New-Object System.Collections.Generic.List[System.Collections.Hashtable]
    $current = $null
    foreach ($line in [IO.File]::ReadAllLines($iniFile)) {
      if ($line -match '^\[') {
        $current = @{}
        $sections.Add($current)
      } elseif ($null -ne $current -and $line -match '^(\w+)=(.*)$') {
        $current[$matches[1]] = $matches[2]
      }
    }

    $profiles = @()
    foreach ($section in $sections) {
      if (-not $section.ContainsKey('Path')) { continue }
      $relative = $section['Path']
      if (Test-Flag $section['IsRelative']) {
        $path = [IO.Path]::Combine($root, $relative.Replace('/', '\'))
      } else {
        $path = $relative
      }
      if ($section.ContainsKey('Name')) {
        $name = $section['Name']
      } else {
        $name = $relative
      }
      if ($installDefault -ne '') {
        $isDefault = ($relative -eq $installDefault)
      } else {
        $isDefault = Test-Flag $section['Default']
      }
      if (Test-Path -LiteralPath $path -PathType Container) {
        $profiles += [pscustomobject]@{ Path = $path; Name = $name; Default = $isDefault }
      }
    }
    return $profiles
  }

  function Select-ZenProfile {
    $rows = @(Get-ZenProfiles)
    if ($rows.Count -eq 0) {
      Stop-Setup 'No Zen profile found. Open Zen once, then run this again, or pass -Profile <dir>'
    }

    $chosen = 0
    for ($i = 0; $i -lt $rows.Count; $i++) {
      if ($rows[$i].Default) { $chosen = $i }
    }

    if ($rows.Count -gt 1 -and -not $Yes -and -not [Console]::IsInputRedirected) {
      Write-Note 'Zen profiles:'
      for ($i = 0; $i -lt $rows.Count; $i++) {
        $mark = ' '
        if ($i -eq $chosen) { $mark = $mint + $dot + $reset }
        Write-Host ('  {0} {1}  {2} {3}({4}){5}' -f $mark, ($i + 1), $rows[$i].Name, $dim, $rows[$i].Path, $reset)
      }
      Write-Host ('{0}?{1} Profile number [{2}] ' -f $peach, $reset, ($chosen + 1)) -NoNewline
      $answer = Read-Host
      $number = 0
      if ($answer -match '^[0-9]+$' -and [int]::TryParse($answer, [ref]$number) -and $number -ge 1 -and $number -le $rows.Count) {
        $chosen = $number - 1
      }
    }
    return $rows[$chosen].Path
  }

  # ---------- Zen ----------

  function Test-ZenRunning {
    return (@(Get-Process -Name 'zen' -ErrorAction SilentlyContinue).Count -gt 0)
  }

  # Zen rewrites prefs.js and reloads mods.json on exit, so every write happens while it is closed.
  function Wait-ZenClosed {
    if (-not (Test-ZenRunning)) { return }
    Write-Note 'Zen is open. Quit it fully (all windows) so setup can write to the profile.'
    if ($Yes -or [Console]::IsInputRedirected) { Stop-Setup 'Zen is running; quit it and run again' }
    while (Test-ZenRunning) { Wait-Enter 'Press Enter once Zen is closed' }
  }

  # ---------- JSON ----------

  function Read-JsonObject([string]$path) {
    return (ConvertFrom-Json -InputObject ([IO.File]::ReadAllText($path)))
  }

  function Read-ModsList([string]$path) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return [pscustomobject]@{} }
    if ((Get-Item -LiteralPath $path).Length -eq 0) { return [pscustomobject]@{} }
    return (Read-JsonObject $path)
  }

  function Get-JsonProperty($object, [string]$name) {
    if ($null -eq $object) { return $null }
    $property = $object.PSObject.Properties[$name]
    if ($null -eq $property) { return $null }
    return $property.Value
  }

  function Set-JsonProperty($object, [string]$name, $value) {
    if ($null -ne $object.PSObject.Properties[$name]) {
      $null = $object.PSObject.Properties.Remove($name)
    }
    $null = $object.PSObject.Properties.Add([System.Management.Automation.PSNoteProperty]::new($name, $value))
  }

  function Write-JsonFile([string]$path, $value) {
    $temp = $path + '.zencast-tmp'
    $json = ConvertTo-Json -InputObject $value -Depth 20 -Compress
    [IO.File]::WriteAllText($temp, $json, [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $path -Force
  }

  function New-WorkDirectory {
    $path = [IO.Path]::Combine([IO.Path]::GetTempPath(), 'zencast-' + [guid]::NewGuid().ToString('N'))
    $null = [IO.Directory]::CreateDirectory($path)
    return $path
  }

  # ---------- Sine ----------

  function Test-SineInstalled([string]$zenProfile) {
    $sineFile = [IO.Path]::Combine([IO.Path]::Combine($zenProfile, 'chrome', 'JS'), 'sine.sys.mjs')
    return (Test-Path -LiteralPath $sineFile -PathType Leaf)
  }

  function Confirm-Sine([string]$zenProfile) {
    if (Test-SineInstalled $zenProfile) {
      Write-Step 'Sine' 'installed'
      return
    }

    Write-Note ("Zencast runs on {0}Sine{1}, the mod manager that lets Zen load script mods." -f $bold, $reset)
    Write-Muted '  Its official installer will ask which browser and profile to use: choose Zen and this profile.'
    Write-Muted "  It may ask for administrator approval to add Sine's loader to Zen's program folder."
    Write-Muted '  https://github.com/CosmoCreeper/Sine'
    if (-not (Confirm-Answer 'Download and run the Sine installer now?')) {
      Stop-Setup 'Sine is required. Install it from https://github.com/CosmoCreeper/Sine/releases/latest, then run this again'
    }

    $cpu = $env:PROCESSOR_ARCHITEW6432
    if (-not $cpu) { $cpu = $env:PROCESSOR_ARCHITECTURE }
    if ($cpu -eq 'AMD64') {
      $arch = 'x64'
    } elseif ($cpu -eq 'ARM64') {
      $arch = 'arm64'
    } else {
      Stop-Setup "Unsupported CPU: $cpu"
    }
    $asset = "sine-win-$arch.exe"

    $tmp = New-WorkDirectory
    $installer = [IO.Path]::Combine($tmp, $asset)
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/CosmoCreeper/Sine/releases/latest/download/$asset" -OutFile $installer
    } catch {
      Stop-Setup "Could not download $asset"
    }
    try {
      $process = Start-Process -FilePath $installer -WorkingDirectory $tmp -Wait -PassThru
    } catch {
      Stop-Setup 'The Sine installer did not finish'
    }
    if ($process.ExitCode -ne 0) { Stop-Setup 'The Sine installer did not finish' }
    Remove-Item -LiteralPath $tmp -Recurse -Force

    if (-not (Test-SineInstalled $zenProfile)) {
      Stop-Setup "Sine is not in $zenProfile yet. Rerun the Sine installer, choose this profile, then run this again"
    }
    Write-Step 'Sine' 'installed'
    # The Sine installer may open Zen when it finishes.
    Wait-ZenClosed
  }

  # ---------- Zencast ----------

  function Get-ModVersion([string]$modDir) {
    $version = Get-JsonProperty (Read-JsonObject ([IO.Path]::Combine($modDir, 'theme.json'))) 'version'
    if ($null -eq $version) { return '?' }
    return [string]$version
  }

  # Adds the mod to Sine's registry like a URL install, so Sine keeps it updated from the release branch.
  function Register-ZencastMod([string]$mods, [string]$themeFile) {
    $modsFile = [IO.Path]::Combine($mods, 'mods.json')
    try {
      $list = Read-ModsList $modsFile
      $theme = Read-JsonObject $themeFile
      $previous = Get-JsonProperty $list $modId
      $createdAt = Get-JsonProperty $previous 'createdAt'
      if ($null -eq $createdAt) { $createdAt = Get-JsonProperty $theme 'updatedAt' }
      # Keep a mod the user disabled in Sine disabled.
      $enabled = $true
      if ($null -ne $previous -and $null -ne $previous.PSObject.Properties['enabled']) {
        $enabled = $previous.enabled
      }

      Set-JsonProperty $theme 'homepage' $homepage
      Set-JsonProperty $theme 'createdAt' $createdAt
      Set-JsonProperty $theme 'enabled' $enabled
      Set-JsonProperty $theme 'no-updates' $false
      Set-JsonProperty $list $modId $theme
      Write-JsonFile $modsFile $list
    } catch {
      Stop-Setup "Could not update $modsFile"
    }
  }

  function Install-ZencastMod([string]$zenProfile) {
    $mods = [IO.Path]::Combine($zenProfile, 'chrome', 'sine-mods')
    $tmp = New-WorkDirectory
    $archive = [IO.Path]::Combine($tmp, 'zencast.zip')
    $extract = [IO.Path]::Combine($tmp, 'extract')
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/$repo/zip/refs/heads/$branch" -OutFile $archive
      Expand-Archive -LiteralPath $archive -DestinationPath $extract
    } catch {
      Stop-Setup "Could not download Zencast from $homepage"
    }

    $source = [IO.Path]::Combine($extract, "zencast-$branch")
    $themeFile = [IO.Path]::Combine($source, 'theme.json')
    $scriptFile = [IO.Path]::Combine($source, 'zencast.uc.mjs')
    if (-not ((Test-Path -LiteralPath $themeFile -PathType Leaf) -and (Test-Path -LiteralPath $scriptFile -PathType Leaf))) {
      Stop-Setup 'The download is missing theme.json or zencast.uc.mjs'
    }

    $null = [IO.Directory]::CreateDirectory($mods)
    $dest = [IO.Path]::Combine($mods, $modId)
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
    Copy-Item -LiteralPath $source -Destination $dest -Recurse
    Register-ZencastMod $mods $themeFile
    Remove-Item -LiteralPath $tmp -Recurse -Force
    Write-Step 'Zencast' ('{0} installed' -f (Get-ModVersion $dest))
  }

  function Remove-ZencastMod([string]$zenProfile) {
    $mods = [IO.Path]::Combine($zenProfile, 'chrome', 'sine-mods')
    $dest = [IO.Path]::Combine($mods, $modId)
    if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }

    $modsFile = [IO.Path]::Combine($mods, 'mods.json')
    if (-not (Test-Path -LiteralPath $modsFile -PathType Leaf)) { return }
    try {
      $list = Read-ModsList $modsFile
      if ($null -ne $list.PSObject.Properties[$modId]) {
        $null = $list.PSObject.Properties.Remove($modId)
      }
      Write-JsonFile $modsFile $list
    } catch {
      Stop-Setup "Could not update $modsFile"
    }
  }

  # ---------- Allow unsafe JS ----------

  function Get-PrefValue([string]$zenProfile, [string]$name) {
    $value = ''
    $pattern = '^user_pref\("' + [regex]::Escape($name) + '", *(.*)\);.*$'
    # user.js is applied after prefs.js, so its value wins.
    foreach ($file in @('prefs.js', 'user.js')) {
      $path = [IO.Path]::Combine($zenProfile, $file)
      if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
      $found = ''
      foreach ($line in [IO.File]::ReadAllLines($path)) {
        if ($line -match $pattern) { $found = $matches[1] }
      }
      if ($found -ne '') { $value = $found }
    }
    return $value
  }

  function Enable-UnsafeJs([string]$zenProfile) {
    $pref = 'sine.allow-unsafe-js'
    if ((Get-PrefValue $zenProfile $pref) -ceq 'true') {
      Write-Step 'Scripts' 'allowed'
      return
    }

    Write-Note ($bold + 'One switch left: Sine''s "Allow unsafe JS".' + $reset)
    Write-Muted '  Zencast is not in the Sine store yet. Sine runs JavaScript only from store mods unless this'
    Write-Muted '  is on. With it on, any mod you install from a URL or folder runs with full browser access,'
    Write-Muted "  so only install mods you trust. Zencast is open source: https://github.com/$repo"
    Write-Muted "  You can turn it off any time in Zen settings $arrow Sine."
    if (-not (Confirm-Answer 'Turn on "Allow unsafe JS" for this profile?')) {
      Write-Note "Zencast stays inactive until you turn it on: Zen settings $arrow Sine $arrow ""Enable installing JS from unofficial sources"", then restart Zen."
      return
    }

    $userFile = [IO.Path]::Combine($zenProfile, 'user.js')
    if ((Test-Path -LiteralPath $userFile -PathType Leaf) -and [IO.File]::ReadAllText($userFile).Contains('"' + $pref + '"')) {
      Stop-Setup "$userFile pins $pref; change it there to true"
    }

    $prefsFile = [IO.Path]::Combine($zenProfile, 'prefs.js')
    $lines = New-Object System.Collections.Generic.List[string]
    if (Test-Path -LiteralPath $prefsFile -PathType Leaf) {
      foreach ($line in [IO.File]::ReadAllLines($prefsFile)) {
        if (-not $line.Contains('"' + $pref + '"')) { $lines.Add($line) }
      }
    }
    $lines.Add("user_pref(""$pref"", true);")
    $temp = $prefsFile + '.zencast-tmp'
    [IO.File]::WriteAllText($temp, (($lines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temp -Destination $prefsFile -Force
    Write-Step 'Scripts' 'allowed'
  }

  # ---------- main ----------

  if ($Help) {
    Show-Usage
    return
  }

  try {
    Write-Title 'Zencast setup'
    if ($null -eq (Get-Command -Name 'Expand-Archive' -ErrorAction SilentlyContinue)) {
      Stop-Setup 'Expand-Archive is required but not installed. Use Windows PowerShell 5 or later'
    }

    $zenProfile = $ProfileDir
    if ([string]::IsNullOrEmpty($zenProfile)) { $zenProfile = Select-ZenProfile }
    if (-not (Test-Path -LiteralPath $zenProfile -PathType Container)) {
      Stop-Setup "No profile at $zenProfile"
    }
    $zenProfile = (Resolve-Path -LiteralPath $zenProfile).ProviderPath
    Write-Step 'Profile' $zenProfile

    Wait-ZenClosed

    if ($Uninstall) {
      Remove-ZencastMod $zenProfile
      Write-Done 'Removed Zencast. Sine and its settings are unchanged.'
      return
    }

    Confirm-Sine $zenProfile
    Install-ZencastMod $zenProfile
    Enable-UnsafeJs $zenProfile

    Write-Host ''
    Write-Done 'Zencast is ready. Open Zen and press Ctrl+K; Ctrl+, opens its settings.'
    Write-Muted "  Updates arrive through Sine. Source and issues: https://github.com/$repo"
  } catch {
    if ($_.Exception.Message -ne $failure) { throw }
    # Not exit: under irm | iex that would close the user's window.
    $global:LASTEXITCODE = 1
  }
}

Install-Zencast @args
