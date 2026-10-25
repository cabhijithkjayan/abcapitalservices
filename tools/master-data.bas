Attribute VB_Name = "GenerateSQLModule"
Option Explicit

' Writes db\sample-data.sql (next to this workbook) from the data sheets.
' The live dashboard reads that file: commit and push it to update the site.
' Keep this code ASCII-only: VBA modules are imported in the system code page.

Private Const SQL_FILE As String = "db\sample-data.sql"
Private Const PWD As String = "12345"

Private Const DEPTS As String = "Management|Sales & Marketing|Company Formation|PRO & Visa|Banking|Accounting & Tax|Loans & Mortgage|Advisory|HR & Admin"
Private Const ROLES As String = "admin|manager|dept_head|staff|finance|viewer"
Private Const PLATFORMS As String = "Meta|Google|LinkedIn|TikTok|Other"
Private Const SOURCES As String = "Website|WhatsApp|Referral|Book-a-Call|Cost Calculator|Walk-in|Meta Ads|Google Ads|Other"
Private Const LEAD_STATUS As String = "New|Contacted|Proposal|Won|Lost"
Private Const CASE_STATUS As String = "Open|On Hold|Completed|Cancelled"
Private Const BANK_STATUS As String = "Preparing|Submitted|Under Review|Approved|Rejected|Withdrawn"
Private Const TAX_TYPES As String = "VAT Return|Corporate Tax Return|E-invoicing|Tax Residency Certificate|Other"

Private errs As Collection
Private kServices As Object, kStaff As Object, kClients As Object, kCampaigns As Object

' Button on the Start sheet
Public Sub GenerateSQL()
    RunGenerate False
End Sub

' Returns "OK: <path>" or the list of problems. silent = True skips message boxes (for testing).
Public Function RunGenerate(Optional ByVal silent As Boolean = False) As String
    Dim sql As String, target As String, msg As String, i As Long
    Set errs = New Collection

    If Dir(ThisWorkbook.Path & "\db", vbDirectory) = "" Then
        msg = "Folder not found: " & ThisWorkbook.Path & "\db" & vbLf & _
              "Keep this workbook in the project folder (next to index.html)."
        If Not silent Then MsgBox msg, vbExclamation, "Generate SQL"
        RunGenerate = msg
        Exit Function
    End If
    target = ThisWorkbook.Path & "\" & SQL_FILE

    Set kServices = Keys("Services", 2, "Service")
    Set kStaff = Keys("Team", 1, "Staff")
    Set kClients = Keys("Clients", 1, "ClientID")
    Set kCampaigns = CreateObject("Scripting.Dictionary")
    Dim dupLeads As Object, dupCases As Object
    Set dupLeads = Keys("Leads", 1, "LeadID")
    Set dupCases = Keys("Cases", 1, "CaseID")

    sql = "-- AB Capital Services: dashboard data for db/schema.sql." & vbLf & _
          "-- Generated from AB Capital Master Data.xlsm on " & Format$(Now, "yyyy-mm-dd hh:nn") & ". Edit the workbook, not this file." & vbLf & _
          "-- This file is public on GitHub Pages: keep real client data out of it." & vbLf & vbLf

    ' Order matters: referenced tables first, and Campaigns before Leads (fills kCampaigns)
    sql = sql & SqlServices() & vbLf
    sql = sql & SqlTeam() & vbLf
    sql = sql & SqlClients() & vbLf
    sql = sql & SqlCampaigns() & vbLf
    sql = sql & SqlLeads() & vbLf
    sql = sql & SqlCases() & vbLf
    sql = sql & SqlExpiries()
    sql = sql & SqlBanking()
    sql = sql & SqlTax() & vbLf
    sql = sql & SqlFinance()
    sql = sql & SqlReceivables()
    sql = sql & SqlBalances()

    If errs.Count > 0 Then
        msg = errs.Count & " problem(s) found. Nothing was written." & vbLf & vbLf
        For i = 1 To errs.Count
            If i > 25 Then msg = msg & "... and " & (errs.Count - 25) & " more": Exit For
            msg = msg & "- " & errs(i) & vbLf
        Next i
        If Not silent Then MsgBox msg, vbExclamation, "Generate SQL"
        RunGenerate = msg
        Exit Function
    End If

    WriteUtf8NoBom target, sql
    StampStart

    If Not silent Then
        MsgBox "Saved " & target & vbLf & vbLf & _
               "To update the live site, open a terminal in the project folder and run:" & vbLf & _
               "  git add db/sample-data.sql" & vbLf & _
               "  git commit -m ""Update dashboard data""" & vbLf & _
               "  git push", vbInformation, "Generate SQL"
    End If
    RunGenerate = "OK: " & target
End Function

' ---------- table builders ----------

Private Function SqlServices() As String
    Dim ws As Worksheet, r As Long, w As String, out As String
    Set ws = ThisWorkbook.Worksheets("Services")
    For r = 2 To LastRow(ws, 3)
        If Not RowEmpty(ws, r, 3) Then
            w = "Services row " & r
            out = out & "insert into services (department_id, name, default_fee) values (" & _
                "(select id from departments where name = " & T(Pick(ws.Cells(r, 1).Value, DEPTS, w & " Department", True)) & "), " & _
                Req(ws.Cells(r, 2).Value, w & " Service") & ", " & _
                N(ws.Cells(r, 3).Value, w & " DefaultFeeAED", "null") & ");" & vbLf
        End If
    Next r
    SqlServices = out
End Function

Private Function SqlTeam() As String
    Dim ws As Worksheet, r As Long, w As String, out As String, role As String
    Set ws = ThisWorkbook.Worksheets("Team")
    For r = 2 To LastRow(ws, 6)
        If Not RowEmpty(ws, r, 6) Then
            w = "Team row " & r
            role = Pick(ws.Cells(r, 4).Value, ROLES, w & " AccessRole", False)
            If role = "" Then role = "staff"
            out = out & "insert into staff (full_name, department_id, job_title, role) values (" & _
                Req(ws.Cells(r, 1).Value, w & " Staff") & ", " & _
                "(select id from departments where name = " & T(Pick(ws.Cells(r, 2).Value, DEPTS, w & " Department", True)) & "), " & _
                T(ws.Cells(r, 3).Value) & ", " & T(role) & ");" & vbLf
            If Not IsBlank(ws.Cells(r, 5).Value) Then
                Dim toVal As Variant
                toVal = ws.Cells(r, 6).Value
                If IsBlank(toVal) Then toVal = ws.Cells(r, 5).Value
                If IsDate(ws.Cells(r, 5).Value) And IsDate(toVal) Then
                    If CDate(toVal) < CDate(ws.Cells(r, 5).Value) Then errs.Add w & ": LeaveTo is before LeaveFrom"
                End If
                out = out & "insert into staff_leave (staff_id, starts_on, ends_on) select id, " & _
                    D(ws.Cells(r, 5).Value, w & " LeaveFrom", True) & ", " & D(toVal, w & " LeaveTo", True) & _
                    " from staff where lower(full_name) = lower(" & T(ws.Cells(r, 1).Value) & ");" & vbLf
            End If
        End If
    Next r
    SqlTeam = out
End Function

Private Function SqlClients() As String
    Dim ws As Worksheet, r As Long, w As String, out As String
    Set ws = ThisWorkbook.Worksheets("Clients")
    For r = 2 To LastRow(ws, 7)
        If Not RowEmpty(ws, r, 7) Then
            w = "Clients row " & r
            out = out & "insert into clients (ref, name, company, jurisdiction, licence_no, trn, start_date) values (" & _
                Req(ws.Cells(r, 1).Value, w & " ClientID") & ", " & Req(ws.Cells(r, 2).Value, w & " Name") & ", " & _
                T(ws.Cells(r, 3).Value) & ", " & T(ws.Cells(r, 4).Value) & ", " & T(ws.Cells(r, 5).Value) & ", " & _
                T(ws.Cells(r, 6).Value) & ", " & D(ws.Cells(r, 7).Value, w & " StartDate", False) & ");" & vbLf
        End If
    Next r
    SqlClients = out
End Function

Private Function SqlCampaigns() As String
    Dim ws As Worksheet, r As Long, w As String, out As String, spend As String, nm As String, k As Variant
    Set ws = ThisWorkbook.Worksheets("Campaigns")
    ' one campaign per name, then one spend row per campaign and month
    For r = 2 To LastRow(ws, 6)
        If Not RowEmpty(ws, r, 6) Then
            w = "Campaigns row " & r
            nm = Trim$(CStr(ws.Cells(r, 2).Value))
            If nm = "" Then
                errs.Add w & " Campaign is required"
            Else
                If Not kCampaigns.Exists(LCase$(nm)) Then
                    kCampaigns.Add LCase$(nm), Array(nm, Pick(ws.Cells(r, 3).Value, PLATFORMS, w & " Platform", True))
                End If
                spend = spend & "insert into campaign_spend (campaign_id, month, spend_aed, impressions, clicks) values (" & _
                    "(select id from campaigns where lower(name) = lower(" & T(nm) & ")), " & MonthStart(ws.Cells(r, 1).Value, w & " Month") & ", " & _
                    N(ws.Cells(r, 4).Value, w & " SpendAED") & ", " & N(ws.Cells(r, 5).Value, w & " Impressions") & ", " & _
                    N(ws.Cells(r, 6).Value, w & " Clicks") & ") on conflict (campaign_id, month) do nothing;" & vbLf
            End If
        End If
    Next r
    For Each k In kCampaigns.Keys
        out = out & "insert into campaigns (name, platform) values (" & T(kCampaigns(k)(0)) & ", " & T(kCampaigns(k)(1)) & ");" & vbLf
    Next k
    SqlCampaigns = out & spend
End Function

Private Function SqlLeads() As String
    Dim ws As Worksheet, r As Long, w As String, out As String, st As String
    Set ws = ThisWorkbook.Worksheets("Leads")
    For r = 2 To LastRow(ws, 9)
        If Not RowEmpty(ws, r, 9) Then
            w = "Leads row " & r
            st = Pick(ws.Cells(r, 8).Value, LEAD_STATUS, w & " Status", False)
            If st = "" Then st = "New"
            out = out & "insert into leads (ref, created_on, source, campaign_id, client_name, service_id, value_aed, status, owner_id) values (" & _
                T(ws.Cells(r, 1).Value) & ", " & D(ws.Cells(r, 2).Value, w & " Date", True) & ", " & _
                T(Pick(ws.Cells(r, 3).Value, SOURCES, w & " Source", True)) & ", " & _
                RefCampaign(ws.Cells(r, 4).Value, w & " Campaign") & ", " & _
                Req(ws.Cells(r, 5).Value, w & " ClientName") & ", " & _
                Ref("services", "name", ws.Cells(r, 6).Value, kServices, w & " Service", "Services", False) & ", " & _
                N(ws.Cells(r, 7).Value, w & " ValueAED") & ", " & T(st) & ", " & _
                Ref("staff", "full_name", ws.Cells(r, 9).Value, kStaff, w & " Owner", "Team", False) & ");" & vbLf
        End If
    Next r
    SqlLeads = out
End Function

Private Function SqlCases() As String
    Dim ws As Worksheet, r As Long, w As String, out As String, st As String, stage As String
    Set ws = ThisWorkbook.Worksheets("Cases")
    For r = 2 To LastRow(ws, 10)
        If Not RowEmpty(ws, r, 10) Then
            w = "Cases row " & r
            st = Pick(ws.Cells(r, 10).Value, CASE_STATUS, w & " Status", False)
            If st = "" Then st = "Open"
            stage = Trim$(CStr(ws.Cells(r, 4).Value))
            If stage = "" Then stage = "New"
            If IsDate(ws.Cells(r, 6).Value) And IsDate(ws.Cells(r, 8).Value) Then
                If CDate(ws.Cells(r, 8).Value) < CDate(ws.Cells(r, 6).Value) Then errs.Add w & ": ClosedOn is before OpenedOn"
            End If
            out = out & "insert into cases (ref, client_id, service_id, stage, assignee_id, opened_on, due_on, closed_on, fee_aed, status) values (" & _
                T(ws.Cells(r, 1).Value) & ", " & _
                Ref("clients", "ref", ws.Cells(r, 2).Value, kClients, w & " ClientID", "Clients", True) & ", " & _
                Ref("services", "name", ws.Cells(r, 3).Value, kServices, w & " Service", "Services", True) & ", " & _
                T(stage) & ", " & _
                Ref("staff", "full_name", ws.Cells(r, 5).Value, kStaff, w & " Assignee", "Team", False) & ", " & _
                D(ws.Cells(r, 6).Value, w & " OpenedOn", True) & ", " & D(ws.Cells(r, 7).Value, w & " DueDate", False) & ", " & _
                D(ws.Cells(r, 8).Value, w & " ClosedOn", False) & ", " & N(ws.Cells(r, 9).Value, w & " FeeAED") & ", " & T(st) & ");" & vbLf
        End If
    Next r
    SqlCases = out
End Function

Private Function SqlExpiries() As String
    Dim ws As Worksheet, r As Long, w As String, out As String
    Set ws = ThisWorkbook.Worksheets("Expiries")
    For r = 2 To LastRow(ws, 4)
        If Not RowEmpty(ws, r, 4) Then
            w = "Expiries row " & r
            out = out & "insert into expiries (client_id, type, number, expiry_date) values (" & _
                Ref("clients", "ref", ws.Cells(r, 1).Value, kClients, w & " ClientID", "Clients", True) & ", " & _
                Req(ws.Cells(r, 2).Value, w & " Type") & ", " & T(ws.Cells(r, 3).Value) & ", " & _
                D(ws.Cells(r, 4).Value, w & " ExpiryDate", True) & ");" & vbLf
        End If
    Next r
    SqlExpiries = out
End Function

Private Function SqlBanking() As String
    Dim ws As Worksheet, r As Long, w As String, out As String, st As String
    Set ws = ThisWorkbook.Worksheets("Banking")
    For r = 2 To LastRow(ws, 5)
        If Not RowEmpty(ws, r, 5) Then
            w = "Banking row " & r
            st = Pick(ws.Cells(r, 4).Value, BANK_STATUS, w & " Status", False)
            If st = "" Then st = "Submitted"
            out = out & "insert into bank_applications (client_id, bank, applied_on, status, rejection_reason) values (" & _
                Ref("clients", "ref", ws.Cells(r, 1).Value, kClients, w & " ClientID", "Clients", True) & ", " & _
                Req(ws.Cells(r, 2).Value, w & " Bank") & ", " & D(ws.Cells(r, 3).Value, w & " AppliedOn", True) & ", " & _
                T(st) & ", " & T(ws.Cells(r, 5).Value) & ");" & vbLf
        End If
    Next r
    SqlBanking = out
End Function

Private Function SqlTax() As String
    Dim ws As Worksheet, r As Long, w As String, out As String
    Set ws = ThisWorkbook.Worksheets("TaxFilings")
    For r = 2 To LastRow(ws, 5)
        If Not RowEmpty(ws, r, 5) Then
            w = "TaxFilings row " & r
            out = out & "insert into tax_filings (client_id, type, period, due_on, filed_on) values (" & _
                Ref("clients", "ref", ws.Cells(r, 1).Value, kClients, w & " ClientID", "Clients", True) & ", " & _
                T(Pick(ws.Cells(r, 2).Value, TAX_TYPES, w & " Type", True)) & ", " & Req(ws.Cells(r, 3).Value, w & " Period") & ", " & _
                D(ws.Cells(r, 4).Value, w & " DueDate", True) & ", " & D(ws.Cells(r, 5).Value, w & " FiledOn", False) & _
                ") on conflict (client_id, type, period) do nothing;" & vbLf
        End If
    Next r
    SqlTax = out
End Function

Private Function SqlFinance() As String
    Dim ws As Worksheet, r As Long, w As String, out As String
    Set ws = ThisWorkbook.Worksheets("Finance")
    For r = 2 To LastRow(ws, 5)
        If Not RowEmpty(ws, r, 5) Then
            w = "Finance row " & r
            out = out & "insert into finance_monthly (month, revenue_aed, expenses_aed, collected_aed, vat_payable_aed) values (" & _
                MonthStart(ws.Cells(r, 1).Value, w & " Month") & ", " & N(ws.Cells(r, 2).Value, w & " RevenueAED") & ", " & _
                N(ws.Cells(r, 3).Value, w & " ExpensesAED") & ", " & N(ws.Cells(r, 4).Value, w & " CollectedAED") & ", " & _
                N(ws.Cells(r, 5).Value, w & " VATPayableAED") & ") on conflict (month) do nothing;" & vbLf
        End If
    Next r
    SqlFinance = out
End Function

Private Function SqlReceivables() As String
    Dim ws As Worksheet, r As Long, w As String, out As String
    Set ws = ThisWorkbook.Worksheets("Receivables")
    For r = 2 To LastRow(ws, 5)
        If Not RowEmpty(ws, r, 5) Then
            w = "Receivables row " & r
            out = out & "insert into receivables (client_name, invoice_no, invoice_date, due_on, amount_aed) values (" & _
                Req(ws.Cells(r, 1).Value, w & " ClientName") & ", " & Req(ws.Cells(r, 2).Value, w & " InvoiceNo") & ", " & _
                D(ws.Cells(r, 3).Value, w & " InvoiceDate", True) & ", " & D(ws.Cells(r, 4).Value, w & " DueDate", True) & ", " & _
                N(ws.Cells(r, 5).Value, w & " AmountAED") & ") on conflict (invoice_no) do nothing;" & vbLf
        End If
    Next r
    SqlReceivables = out
End Function

Private Function SqlBalances() As String
    Dim ws As Worksheet, r As Long, w As String, out As String
    Set ws = ThisWorkbook.Worksheets("BankBalances")
    For r = 2 To LastRow(ws, 4)
        If Not RowEmpty(ws, r, 4) Then
            w = "BankBalances row " & r
            out = out & "insert into bank_balances (bank, account, balance_aed, as_of) values (" & _
                Req(ws.Cells(r, 1).Value, w & " Bank") & ", " & Req(ws.Cells(r, 2).Value, w & " Account") & ", " & _
                N(ws.Cells(r, 3).Value, w & " BalanceAED") & ", " & D(ws.Cells(r, 4).Value, w & " AsOf", True) & _
                ") on conflict (bank, account, as_of) do nothing;" & vbLf
        End If
    Next r
    SqlBalances = out
End Function

' ---------- helpers ----------

Private Function IsBlank(ByVal v As Variant) As Boolean
    If IsError(v) Then IsBlank = False: Exit Function
    IsBlank = (Len(Trim$(CStr(v))) = 0)
End Function

Private Function LastRow(ws As Worksheet, ByVal cols As Long) As Long
    Dim c As Long, r As Long
    LastRow = 1
    For c = 1 To cols
        r = ws.Cells(ws.Rows.Count, c).End(xlUp).Row
        If r > LastRow Then LastRow = r
    Next c
End Function

Private Function RowEmpty(ws As Worksheet, ByVal r As Long, ByVal cols As Long) As Boolean
    Dim c As Long
    For c = 1 To cols
        If Not IsBlank(ws.Cells(r, c).Value) Then RowEmpty = False: Exit Function
    Next c
    RowEmpty = True
End Function

' Distinct values of one column (lower-cased keys); duplicates are reported.
Private Function Keys(ByVal sheet As String, ByVal col As Long, ByVal label As String) As Object
    Dim ws As Worksheet, r As Long, s As String, d As Object
    Set d = CreateObject("Scripting.Dictionary")
    Set ws = ThisWorkbook.Worksheets(sheet)
    For r = 2 To LastRow(ws, col)
        s = Trim$(CStr(ws.Cells(r, col).Value))
        If s <> "" Then
            If d.Exists(LCase$(s)) Then
                errs.Add sheet & " row " & r & ": " & label & " '" & s & "' is used twice"
            Else
                d.Add LCase$(s), r
            End If
        End If
    Next r
    Set Keys = d
End Function

' SQL text literal, or null when blank
Private Function T(ByVal v As Variant) As String
    Dim s As String
    If IsError(v) Then T = "null": Exit Function
    s = Trim$(CStr(v))
    If Len(s) = 0 Then T = "null" Else T = "'" & Replace(s, "'", "''") & "'"
End Function

' Required text
Private Function Req(ByVal v As Variant, ByVal where As String) As String
    If IsBlank(v) Then errs.Add where & " is required"
    Req = T(v)
End Function

Private Function D(ByVal v As Variant, ByVal where As String, ByVal required As Boolean) As String
    If IsBlank(v) Then
        If required Then errs.Add where & " is required"
        D = "null"
    ElseIf IsDate(v) Then
        D = "'" & Format$(CDate(v), "yyyy-mm-dd") & "'"
    Else
        errs.Add where & ": '" & CStr(v) & "' is not a date"
        D = "null"
    End If
End Function

' First day of the month of a date
Private Function MonthStart(ByVal v As Variant, ByVal where As String) As String
    If IsBlank(v) Then
        errs.Add where & " is required": MonthStart = "null"
    ElseIf IsDate(v) Then
        MonthStart = "'" & Format$(DateSerial(Year(CDate(v)), Month(CDate(v)), 1), "yyyy-mm-dd") & "'"
    Else
        errs.Add where & ": '" & CStr(v) & "' is not a date": MonthStart = "null"
    End If
End Function

Private Function N(ByVal v As Variant, ByVal where As String, Optional ByVal blank As String = "0") As String
    If IsBlank(v) Then
        N = blank
    ElseIf IsNumeric(v) Then
        N = Trim$(Str$(CDbl(v)))
    Else
        errs.Add where & ": '" & CStr(v) & "' is not a number": N = blank
    End If
End Function

' Value from a fixed list (case-insensitive); returns the canonical spelling
Private Function Pick(ByVal v As Variant, ByVal allowed As String, ByVal where As String, ByVal required As Boolean) As String
    Dim s As String, opt As Variant
    s = Trim$(CStr(v))
    If s = "" Then
        If required Then errs.Add where & " is required"
        Pick = "": Exit Function
    End If
    For Each opt In Split(allowed, "|")
        If LCase$(opt) = LCase$(s) Then Pick = opt: Exit Function
    Next opt
    errs.Add where & ": '" & s & "' is not one of " & Replace(allowed, "|", ", ")
    Pick = s
End Function

' Lookup of another sheet's row by name / ID
Private Function Ref(ByVal tbl As String, ByVal col As String, ByVal v As Variant, known As Object, _
                     ByVal where As String, ByVal sheet As String, ByVal required As Boolean) As String
    Dim s As String
    s = Trim$(CStr(v))
    If s = "" Then
        If required Then errs.Add where & " is required"
        Ref = "null": Exit Function
    End If
    If Not known.Exists(LCase$(s)) Then errs.Add where & ": '" & s & "' is not on the " & sheet & " sheet"
    Ref = "(select id from " & tbl & " where lower(" & col & ") = lower(" & T(s) & ") limit 1)"
End Function

Private Function RefCampaign(ByVal v As Variant, ByVal where As String) As String
    Dim s As String
    s = Trim$(CStr(v))
    If s = "" Then RefCampaign = "null": Exit Function
    If Not kCampaigns.Exists(LCase$(s)) Then errs.Add where & ": '" & s & "' is not on the Campaigns sheet"
    RefCampaign = "(select id from campaigns where lower(name) = lower(" & T(s) & "))"
End Function

' UTF-8 without the byte-order mark, so Postgres reads the first statement cleanly
Private Sub WriteUtf8NoBom(ByVal path As String, ByVal text As String)
    Dim s As Object, b As Object
    Set s = CreateObject("ADODB.Stream")
    s.Type = 2: s.Charset = "utf-8": s.Open
    s.WriteText text
    s.Position = 3
    Set b = CreateObject("ADODB.Stream")
    b.Type = 1: b.Open
    s.CopyTo b
    b.SaveToFile path, 2
    b.Close: s.Close
End Sub

Private Sub StampStart()
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets("Start")
    ws.Unprotect PWD
    ws.Range("C16").Value = Now
    ws.Protect PWD, True, True
End Sub
