# SP 99999 handover test documents

Generated test documents ("Test Generator", fictional details), printed from
Urbanise Strata for the test building 1 Bennelong Point, Sydney (Plan No.
99999). Supplied on 24 Oct 2026 to test onboarding from handover documents.

The expected lot register is in `src/lib/parse-strata-roll.sp99999.test.ts`:
15 lots, total unit entitlement 51,800.

`01_Annual_Financial_Statement_FY2025-26.pdf` is the annual financial
statement for 1 July 2025 to 30 June 2026. Its income and expenditure, by
fund and account, are checked in
`src/lib/onboarding/read-income-statement.sp99999.test.ts`: admin fund
$868.45 opening, $32,435.34 income, $23,267.17 expenditure, $10,036.62
closing; capital works fund $85,457.96 opening, $5,562.54 income, $6,594.50
expenditure, $84,426.00 closing.
