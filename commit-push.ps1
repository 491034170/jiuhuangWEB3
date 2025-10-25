# 自动提交并推送当前仓库的辅助脚本
Param(
    [string]$Message
)

$ErrorActionPreference = 'Stop'

Push-Location -LiteralPath $PSScriptRoot
try {
    $changes = git status --porcelain
    if (-not $changes) {
        Write-Host 'No changes detected. Nothing to commit.'
        return
    }

    if (-not $Message) {
        $Message = "auto: commit $(Get-Date -Format 'yyyyMMdd-HHmmss')"
    }

    git add -A
    git commit -m $Message
    git push
    Write-Host 'Changes committed and pushed successfully.'
} catch {
    Write-Error $_
    exit 1
} finally {
    Pop-Location
}
