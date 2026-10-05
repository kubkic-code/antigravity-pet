# test-antigravity-events.ps1
# Testovací skript pro ověření komunikace, událostí a multi-bot routingu z Antigravity IDE (Fáze 2 & 4)

param (
    [string]$ProjectName = "coucou-main",
    [string]$WorkspacePath = "$PSScriptRoot",
    [int]$VscodePid = 0,
    [switch]$MultiBot = $false
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Antigravity Pet - Test událostí a Multi-bot routing    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Kontrola registrace v hooks.json
$userProfile = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile)
$hooksJsonPath = Join-Path $userProfile ".gemini\config\hooks.json"

Write-Host "`n[1/3] Kontrola konfigurace hooks: $hooksJsonPath" -ForegroundColor Yellow
if (Test-Path $hooksJsonPath) {
    try {
        $hooksConfig = Get-Content $hooksJsonPath -Raw | ConvertFrom-Json
        $foundMarker = $false
        if ($hooksConfig.hooks) {
            foreach ($prop in $hooksConfig.hooks.PSObject.Properties) {
                foreach ($item in $prop.Value) {
                    if ($item.description -match "antigravity-pet" -or $item.command -match "coucou-hook") {
                        $foundMarker = $true
                        Write-Host "  [OK] Nalezen hook pro událost: $($prop.Name) -> $($item.command)" -ForegroundColor Green
                    }
                }
            }
        }
        if (-not $foundMarker) {
            Write-Host "  [INFO] hooks.json existuje, ale AntigravityPet hooky zatím nejsou zapsány (zapisují se při startu aplikace)." -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "  [WARN] Nepodařilo se parsovat $($hooksJsonPath): $_" -ForegroundColor DarkYellow
    }
} else {
    Write-Host "  [INFO] $hooksJsonPath zatím neexistuje (vytvoří se při registraci)." -ForegroundColor DarkGray
}

# 2. Zjištění adresy Named Pipe
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$sid = $currentUser.User.Value
$pipeName = "coucou-$sid"
$pipeFullName = "\\.\pipe\$pipeName"

Write-Host "`n[2/3] Identifikace komunikačního kanálu (Named Pipe):" -ForegroundColor Yellow
Write-Host "  SID uživatele: $sid" -ForegroundColor Gray
Write-Host "  Cílová roura : $pipeFullName" -ForegroundColor Green

# 3. Funkce pro odeslání události přes Named Pipe
function Send-NamedPipeEvent {
    param (
        [Parameter(Mandatory=$true)]
        [hashtable]$Payload
    )

    $json = ($Payload | ConvertTo-Json -Compress) + "`n"
    
    try {
        $pipeClient = New-Object System.IO.Pipes.NamedPipeClientStream(".", $pipeName, [System.IO.Pipes.PipeDirection]::InOut)
        # Timeout 500ms pro připojení (pokud aplikace neběží, nečekat minuty)
        $pipeClient.Connect(500)
        
        $writer = New-Object System.IO.StreamWriter($pipeClient, [System.Text.Encoding]::UTF8)
        $writer.AutoFlush = $true
        $writer.Write($json)
        
        $detail = if ($Payload.prompt) { $Payload.prompt } elseif ($Payload.tool_name) { $Payload.tool_name } else { $Payload.message }
        Write-Host "  [ODESLÁNO] [$($Payload.session_id)] $($Payload.hook_event_name) - $detail" -ForegroundColor Green
        
        $writer.Dispose()
        $pipeClient.Dispose()
        return $true
    } catch [System.TimeoutException] {
        Write-Host "  [CHYBA] Named Pipe nebyla nalezena (aplikace AntigravityPet zatím neběží na pozadí)." -ForegroundColor Red
        return $false
    } catch {
        Write-Host "  [CHYBA] Komunikace selhala: $_" -ForegroundColor Red
        return $false
    }
}

# 4. Simulace toku událostí relací Antigravity IDE
Write-Host "`n[3/3] Simulace toku událostí relace Antigravity IDE:" -ForegroundColor Yellow

$session1 = "session-ide-1-" + [Guid]::NewGuid().ToString().Substring(0, 6)
$session2 = "session-ide-2-" + [Guid]::NewGuid().ToString().Substring(0, 6)

$events = [System.Collections.Generic.List[hashtable]]::new()

# Události pro relaci 1 (Bot 1)
$events.Add(@{
    hook_event_name = "SessionStart"
    session_id = $session1
    cwd = "$WorkspacePath\coucou-main"
    vscode_pid = if ($VscodePid -gt 0) { "$VscodePid" } else { "$PID" }
})
$events.Add(@{
    hook_event_name = "UserPromptSubmit"
    session_id = $session1
    cwd = "$WorkspacePath\coucou-main"
    prompt = "Vytvoř novou komponentu bota a otestuj napojení"
    vscode_pid = if ($VscodePid -gt 0) { "$VscodePid" } else { "$PID" }
})
$events.Add(@{
    hook_event_name = "PreToolUse"
    session_id = $session1
    cwd = "$WorkspacePath\coucou-main"
    tool_name = "Write"
    tool_input = @{ file_path = "$WorkspacePath\src\bot.ts" }
    vscode_pid = if ($VscodePid -gt 0) { "$VscodePid" } else { "$PID" }
})

# Pokud je zvolen MultiBot test, přidáme paralelní relaci 2 (Bot 2)
if ($MultiBot) {
    Write-Host "  [Režim Multi-Bot aktivní: simulace 2 nezávislých oken IDE]" -ForegroundColor Magenta
    $events.Add(@{
        hook_event_name = "SessionStart"
        session_id = $session2
        cwd = "$WorkspacePath\coucou-client"
        vscode_pid = "$([int]$PID + 1)"
    })
    $events.Add(@{
        hook_event_name = "UserPromptSubmit"
        session_id = $session2
        cwd = "$WorkspacePath\coucou-client"
        prompt = "Spusť integraci testů na druhém okně"
        vscode_pid = "$([int]$PID + 1)"
    })
    $events.Add(@{
        hook_event_name = "PreToolUse"
        session_id = $session2
        cwd = "$WorkspacePath\coucou-client"
        tool_name = "Bash"
        tool_input = @{ command = "cargo test" }
        vscode_pid = "$([int]$PID + 1)"
    })
}

# Dokončení pro relaci 1
$events.Add(@{
    hook_event_name = "Stop"
    session_id = $session1
    cwd = "$WorkspacePath\coucou-main"
    message = "Úkol byl úspěšně dokončen!"
    vscode_pid = if ($VscodePid -gt 0) { "$VscodePid" } else { "$PID" }
})

if ($MultiBot) {
    $events.Add(@{
        hook_event_name = "SessionEnd"
        session_id = $session2
        cwd = "$WorkspacePath\coucou-client"
        message = "Okno 2 zavřeno uživatelem"
        vscode_pid = "$([int]$PID + 1)"
    })
}

Write-Host "Připraveno $($events.Count) testovacích událostí." -ForegroundColor Gray
Write-Host "Pro odeslání událostí do běžící aplikace můžete tento skript spustit přímo.`n"

$connected = $false
foreach ($ev in $events) {
    $ok = Send-NamedPipeEvent -Payload $ev
    if ($ok) {
        $connected = $true
        Start-Sleep -Milliseconds 300
    } else {
        break
    }
}

if ($connected) {
    Write-Host "`n[ÚSPĚCH] Všechny události byly úspěšně odeslány do AntigravityPet!" -ForegroundColor Green
} else {
    Write-Host "`n[INFO] Skript je připraven pro integrační testování s běžícím Tauri backendem." -ForegroundColor Yellow
}
