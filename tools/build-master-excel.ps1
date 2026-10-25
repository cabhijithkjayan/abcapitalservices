# Builds "AB Capital Master Data.xlsm" in the project folder:
#   1. sample data -> JSON (node), 2. layout (python/openpyxl),
#   3. Excel adds the Generate SQL macro and button, protects sheets and structure (password 12345).
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File tools\build-master-excel.ps1
# Overwrites an existing workbook only with -Force.
param([switch]$Force)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'AB Capital Master Data.xlsm'
if ((Test-Path $out) -and -not $Force) { throw "$out exists and may hold your edits. Re-run with -Force to replace it." }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("abc-master-" + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
$json = Join-Path $tmp 'sample.json'
$xlsx = Join-Path $tmp 'layout.xlsx'
$password = '12345'

# 1. sample data as JSON, dates as local yyyy-mm-dd
$js = @'
const fs = require('fs'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2] + '/js/data.js', 'utf8') + '\nthis.S = makeSampleData();', ctx);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fix = (o) => { for (const k in o) { const v = o[k]; if (v && typeof v === 'object' && typeof v.getFullYear === 'function') o[k] = iso(v); else if (v && typeof v === 'object') fix(v); } return o; };
fs.writeFileSync(process.argv[3], JSON.stringify(fix(ctx.S)));
'@
$jsFile = Join-Path $tmp 'dump.js'
Set-Content -Path $jsFile -Value $js -Encoding UTF8
node $jsFile $root $json
if ($LASTEXITCODE -ne 0) { throw 'node failed' }

# 2. layout
python (Join-Path $PSScriptRoot 'build-master-excel.py') $json $xlsx
if ($LASTEXITCODE -ne 0) { throw 'python failed' }

# 3. macro, button, protection
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false
$xl.DisplayAlerts = $false
try {
    $wb = $xl.Workbooks.Open($xlsx)
    [void]$wb.VBProject.VBComponents.Import((Join-Path $PSScriptRoot 'master-data.bas'))

    $start = $wb.Worksheets.Item('Start')
    $anchor = $start.Range('C13')
    $btn = $start.Buttons().Add($anchor.Left, $anchor.Top, 200, 34)
    $btn.OnAction = 'GenerateSQL'
    $btn.Characters().Text = 'Generate SQL'
    $btn.Font.Bold = $true
    $btn.Font.Size = 12
    $start.Rows(13).RowHeight = 36

    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -eq 'Lists') { $ws.Visible = 2; continue }   # xlSheetVeryHidden
        # Password, DrawingObjects, Contents, Scenarios, UserInterfaceOnly, AllowFormattingCells,
        # AllowFormattingColumns, AllowFormattingRows, AllowInsertingColumns, AllowInsertingRows,
        # AllowInsertingHyperlinks, AllowDeletingColumns, AllowDeletingRows, AllowSorting, AllowFiltering
        $ws.Protect($password, $true, $true, $true, $false, $false, $true, $true, $false, $false, $false, $false, $false, $true, $true)
    }
    $wb.Worksheets.Item('Start').Activate()
    $wb.Protect($password, $true, $false)
    $wb.SaveAs($out, 52)   # xlOpenXMLWorkbookMacroEnabled
    $wb.Close($false)
} finally {
    $xl.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
Write-Output "Built $out"
