# IBM Accounts Receivable CSV (Kaggle schema)
#
# Bundled sample uses the same columns as:
# https://www.kaggle.com/datasets/hhenry/finance-factoring-ibm-late-payment-histories
#
# To use the official file:
# 1. Download WA_Fn-UseC_-Accounts-Receivable.csv from Kaggle
# 2. Replace this file (same name) or pass --file=/path/to/csv
# 3. Run: npm run import:ibm
#
# Columns expected:
# countryCode, customerID, PaperlessDate, invoiceNumber, InvoiceDate,
# DueDate, InvoiceAmount, Disputed, SettledDate, PaperlessBill,
# DaysToSettle, DaysLate
