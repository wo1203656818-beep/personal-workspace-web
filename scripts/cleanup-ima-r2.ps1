# cleanup-ima-r2.ps1
# 清理 R2 中旧的 IMA 笔记附件（ima/attachments/ 前缀下的所有对象）
# 运行前请确保已配置好 wrangler 认证
# 用法: .\cleanup-ima-r2.ps1

$BUCKET = "personal-workspace-storage"
$PREFIX = "ima/attachments/"

Write-Host "正在列出 R2 中 $PREFIX 下的所有对象..." -ForegroundColor Cyan

# 列出所有对象
$objects = @()
$cursor = ""
do {
    $cmd = "wrangler r2 object list $BUCKET --prefix=$PREFIX --limit=1000"
    if ($cursor) { $cmd += " --cursor=$cursor" }
    $result = Invoke-Expression "$cmd 2>&1" | Out-String

    # 解析输出中的对象路径（每行一个）
    $lines = $result -split "`n" | Where-Object { $_ -match "Key:" -or $_ -match $PREFIX }
    foreach ($line in $lines) {
        $key = ($line -split ":\s*")[-1].Trim()
        if ($key -and $key.StartsWith($PREFIX)) {
            $objects += $key
        }
    }

    # 尝试提取 cursor
    if ($result -match "Cursor:\s*(\S+)") {
        $cursor = $Matches[1]
    } else {
        $cursor = ""
    }
} while ($cursor)

if ($objects.Count -eq 0) {
    Write-Host "没有找到需要清理的对象。" -ForegroundColor Green
    exit 0
}

Write-Host "找到 $($objects.Count) 个对象，开始清理..." -ForegroundColor Yellow

$deleted = 0
foreach ($key in $objects) {
    try {
        wrangler r2 object delete "$BUCKET/$key" 2>&1 | Out-Null
        $deleted++
        Write-Host "  已删除: $key" -ForegroundColor DarkGray
    } catch {
        Write-Host "  删除失败: $key - $_" -ForegroundColor Red
    }
}

Write-Host "清理完成: 已删除 $deleted/$($objects.Count) 个对象" -ForegroundColor Green
