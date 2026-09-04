# CoinQuest Finance Domain

CoinQuest is local-first. Financial records live in IndexedDB through Dexie, and Phaser reacts only to interpreted events/state. Phaser must not own financial data.

## SelectedMonth

`SelectedMonth` is the UI and calculation context for monthly views.

```ts
{
  year: 2026,
  month: 7
}
```

`month` is zero-based to match JavaScript local `Date` APIs. August is `7`, September is `8`.

Use local date constructors such as `new Date(year, month, day, hour, minute)` for month navigation and date inputs. Avoid parsing date-only strings like `new Date("2026-08-29")`, because they are interpreted as UTC and can drift to the previous local day in some timezones.

## Transaction

Transactions are actual movements that already happened or were explicitly recorded as happened.

They contain:

- type: `income` or `expense`
- kind: `standard` or `credit_card_payment`
- amount
- description
- category
- payment method
- occurredAt
- createdAt

Transactions are the source for derived values such as balance, monthly summary, budget usage and FinancialHealth. Do not persist derived totals as transaction aggregates.

`kind: standard` is the default for existing and ordinary records. `kind: credit_card_payment` is used only for real cash movement created when a credit card invoice is paid. A credit card purchase itself is not a Transaction.

## MonthlyBudget

MonthlyBudget stores the user's planned total spending limit for one year/month.

There is at most one MonthlyBudget per:

- year
- month

It stores planning data only:

- totalLimit
- createdAt
- updatedAt

It does not store `spent`, `remaining` or `percentageUsed`; those values are derived from expense transactions.

## CategoryBudget

CategoryBudget stores an optional category spending limit for one year/month/category.

There is at most one CategoryBudget per:

- year
- month
- category

Income never consumes budget. Only standard expense transactions and committed credit card installments in the selected month are budget-consumable in Budget V1. Credit card invoice payment transactions do not consume budget again, because the installments already represented that spending commitment.

## Planned Does Not Equal Actual

Recurring and future concepts are planning data until the user explicitly confirms them:

- RecurringRule
- RecurringOccurrence
- RecurringOccurrenceOverride
- MonthlyOutlook
- RecurringItem
- Installment
- PlannedTransaction

These must not be stored as regular `Transaction` records until they become actual realized movements. A future budget can exist without future transactions.

This distinction protects summaries, FinancialHealth and the game world from treating planned money as real money.

## RecurringRule

RecurringRule is a reusable monthly rule for expected income or expense.

V1 supports monthly cadence only:

- type: `income` or `expense`
- description
- amount
- category
- payment method
- dayOfMonth, from 1 to 31
- startYear/startMonth
- optional endYear/endMonth
- active

`month` fields are zero-based. A rule applies when the selected month is greater than or equal to the start month and less than or equal to the end month when an end exists. Inactive rules do not generate occurrences.

Day 29/30/31 uses the last valid day when the selected month is shorter. A rule on day 31 appears on February 28 or 29 depending on the year.

## RecurringOccurrence

RecurringOccurrence is derived at read time from a RecurringRule and SelectedMonth.

It is not a permanent transaction and is not materialized for every future month.

Statuses:

- pending: still expected
- overdue: expected date passed, but not confirmed
- skipped: intentionally ignored for that month
- realized: explicitly converted into an actual Transaction

Pending and overdue occurrences can contribute to MonthlyOutlook as planned remaining. Skipped and realized occurrences do not.

## RecurringOccurrenceOverride

RecurringOccurrenceOverride stores only exceptions or monthly state.

Unique logical key:

- ruleId
- year
- month

It can mark one occurrence as skipped or realized. When realized, it may store `linkedTransactionId`.

If the linked transaction is deleted, the derived occurrence returns to pending/overdue behavior. The rule itself remains unchanged.

## MonthlyOutlook

MonthlyOutlook combines actual and planned values while keeping them separate:

- actualIncome
- actualExpense
- plannedIncome
- plannedExpense
- committedCardExpense
- projectedIncome
- projectedExpense
- projectedNet

Use labels such as "Resultado projetado do mes" or "Saldo mensal projetado". Do not present this as a real bank balance, because CoinQuest does not yet know the complete external account balance.

FinancialHealth remains primarily based on actual transactions plus budget. Planned items belong to MonthlyOutlook unless a future phase explicitly defines another health signal.

## MonthlyProjection

MonthlyProjection is the pure multi-month projection result for one year/month. It combines three sources without changing their meaning:

- actual: real Transactions in that month
- planned recurring: pending/overdue RecurringOccurrences
- card commitments: unpaid CreditCardInvoices for that invoice competence

Main fields:

- actualIncome
- actualExpense
- plannedRecurringIncome
- plannedRecurringExpense
- committedCardExpense
- projectedIncome
- projectedExpense
- projectedNet
- cumulativeProjectedNet
- optional budgetLimit
- breakdown

Budget can be attached as a reference limit, but it is not subtracted from projectedNet. Budget is planning capacity, not a future expense.

## ProjectedNet

ProjectedNet is:

```text
projectedIncome - projectedExpense
```

Projected income is actual income plus planned recurring income not yet realized. Projected expense is actual cash expense plus planned recurring expense not yet realized plus pending card commitments.

ProjectedNet is a projected monthly result, not a bank balance. CoinQuest does not infer an opening balance or external account balance in Projection V1.

## CumulativeProjectedNet

CumulativeProjectedNet is the running sum of monthly ProjectedNet values across the requested horizon.

Example:

- September: +500
- October: +300
- November: -100

Cumulative projected result:

- September: +500
- October: +800
- November: +700

This is still a sum of projected monthly results. It is not a real or guaranteed future account balance.

## Goal

Goal is a mission-like planning object. It represents an objective the user wants to reserve value toward, such as a notebook, emergency reserve, course or setup upgrade.

Fields:

- name
- optional description
- targetAmount
- optional targetDate
- optional monthlyPlan
- status: `active`, `completed`, or `archived`
- optional priority
- createdAt
- updatedAt

A Goal is not account balance. Completing a Goal means the allocated value reached the target amount. It does not mean the product was bought or that cash moved.

## GoalContribution

GoalContribution is an explicit allocation adjustment for one Goal.

Fields:

- goalId
- amount
- date
- optional note
- createdAt

Positive amounts increase allocated value. Negative amounts explicitly withdraw or correct allocated value. CoinQuest keeps these adjustments as history instead of storing only a mutable `savedAmount`.

## GoalAllocation

Goal allocation is the sum of GoalContribution amounts for a Goal.

It is planning/allocation data only:

- It does not create a Transaction.
- It does not consume MonthlyBudget.
- It does not change MonthlyOutlook.
- It does not change MonthlyProjection.
- It does not change FinancialHealth in Goals V1.

Example: if the account has R$1,000 and the user allocates R$300 to a Notebook goal, CoinQuest records a GoalContribution of R$300. It must not create an expense of R$300, because no cash necessarily left the account.

## GoalProgress

GoalProgress is derived from a Goal and its GoalContributions:

- targetAmount
- allocatedAmount
- remainingAmount
- percentageRaw
- percentageDisplay
- estimatedMonthsRemaining
- monthsUntilTarget
- requiredMonthlyAllocation
- targetDatePassed

`percentageRaw` can exceed 100% when the allocated amount is above the target. `percentageDisplay` is capped at 100% for future UI progress bars, but the extra allocation remains preserved.

If `allocatedAmount >= targetAmount`, an active goal can be marked `completed`. If later negative adjustments reduce allocation below the target, the goal can return to `active`. Archived goals stay archived until explicitly restored.

`monthlyPlan` is a reference for estimating months remaining. It is not a RecurringRule and must not generate planned Transactions.

`targetDate` enables date math such as months until target and required monthly allocation. This is a calculation, not financial advice.

Goal completed does not mean purchase completed. A future phase may add "Simular compra desta missão", but Goals V1 does not create purchases, card commitments or expenses automatically.

## CreditCard

CreditCard defines one local card profile:

- name
- optional creditLimit
- closingDay
- dueDay
- active

`closingDay` and `dueDay` are used to calculate invoice cycles. If a day 29/30/31 does not exist in a month, CoinQuest uses the last valid day of that month.

Name, credit limit and active state can be edited. In V1, `closingDay` and `dueDay` are cycle-defining fields: once the card has purchases, changing them is blocked to avoid rewriting invoice history.

Inactive cards preserve purchases, installments, invoices and payments. They do not accept new purchases.

## CardPurchase

CardPurchase is a finite commitment already assumed on a card:

- cardId
- description
- category
- totalAmount
- purchaseDate
- installmentCount

Card purchase does not move cash immediately and must not be stored as a normal Transaction. A one-installment card purchase still belongs to an invoice.

## InstallmentOccurrence

InstallmentOccurrence is derived from a CardPurchase and CreditCard cycle. It represents one installment inside one invoice month:

- purchaseId
- cardId
- installmentNumber/installmentCount
- amount
- invoiceYear/invoiceMonth
- dueDate
- status

Installments are derived when needed; CoinQuest does not materialize infinite invoices. Installment cents are split so the sum always equals the original purchase total.

## CreditCardInvoice

CreditCardInvoice is a derived aggregate for one card and invoice month:

- cardId
- year/month: invoice competence, not necessarily cash movement month
- dueDate: contractual invoice due date
- optional paymentDate: date when cash actually moved
- optional paidLate: true when paymentDate is after dueDate by local calendar day
- installments
- total
- status: `open`, `due`, `overdue`, or `paid`

An invoice becomes `paid` only when a CardInvoicePayment exists and its linked Transaction still exists. If the linked payment transaction is deleted, the invoice returns to open/due/overdue behavior.

## CardInvoicePayment

CardInvoicePayment links one paid card invoice to one real Transaction:

- cardId
- invoiceYear/invoiceMonth
- linkedTransactionId
- paymentDate
- paidAt

`paymentDate` is the real financial date of the cash movement. It is chosen by the user when paying/correcting the invoice.

`paidAt` is a technical timestamp for when the confirmation was recorded in CoinQuest.

There is at most one payment per card/year/month. Paying an invoice creates exactly one `expense` Transaction with `kind: credit_card_payment`.

Invoice competence and cash movement can differ. Example: an October invoice due on October 2 can be paid on September 30. The invoice remains October competence, while the payment Transaction belongs to September.

## Card Spending vs Cash Movement

CoinQuest keeps two related but different concepts:

- Spending commitment: direct standard expenses plus card installments in the selected invoice month.
- Cash movement: actual money in/out, including invoice payment when the user explicitly pays it.

This prevents double counting:

- Budget usage counts card installments.
- Invoice payment does not consume budget again.
- MonthlyOutlook counts unpaid invoices as committed card expense.
- After payment, MonthlyOutlook counts the payment transaction as actual expense and no longer counts that invoice as unpaid commitment.

Generic transaction editing must not structurally change a linked invoice payment. Corrections to payment date or method should be performed from the card area so `CardInvoicePayment` and the linked `Transaction` remain synchronized.

## PurchaseScenario

PurchaseScenario is a hypothetical purchase used by the simulator engine. It is not persisted and it is not real financial data.

Fields:

- name
- totalAmount
- purchaseDate
- mode: `cash` or `credit_card`
- optional category
- optional paymentMethod for cash
- cardId and installmentCount for credit card simulations
- optional goalId or Goal context

Cash scenarios are modeled in memory as one hypothetical standard expense Transaction on the purchase date. Credit card scenarios are modeled in memory as one hypothetical CardPurchase, then existing card cycle and installment rules calculate invoice impact.

Simulation never creates:

- Transaction
- CardPurchase
- GoalContribution
- RecurringRule
- Phaser event

## PurchaseSimulationResult

PurchaseSimulationResult compares a baseline projection with a scenario projection.

Main fields:

- baselineMonths
- scenarioMonths
- monthlyImpact
- summary
- optional cardLimit
- optional goalContext

BaselineProjection is the result of `projectMonths` with current real/planned inputs. ScenarioProjection is the result of `projectMonths` with the same input plus the in-memory hypothetical purchase.

## MonthlyImpact

MonthlyImpact compares one month:

```text
delta = scenarioProjectedNet - baselineProjectedNet
```

For a purchase, the delta is usually negative. The simulator keeps this neutral: it does not call a purchase good, bad, safe, dangerous, affordable or unaffordable.

## Simulation Impact Metrics

The simulator reports objective summary fields:

- totalPurchaseAmount
- impactWithinHorizon
- impactOutsideHorizon
- scenarioFullyVisibleInHorizon
- affectedMonths
- baselineNegativeMonths
- scenarioNegativeMonths
- newNegativeMonths
- worstProjectedMonth
- largestMonthlyImpact
- baselineCumulativeProjectedNet
- scenarioCumulativeProjectedNet
- cumulativeDelta

`impactWithinHorizon` is the portion of the hypothetical purchase visible in the requested projection horizon. `impactOutsideHorizon` is the remaining portion outside that horizon. This matters for long installments: a 12x purchase shown in only 3 months must not look like only the first 3 installments exist.

`newNegativeMonths` only includes months that were not negative in the baseline and became negative in the scenario.

`worstProjectedMonth` is the month with the lowest scenario projected result inside the horizon. It is not automatically a risk score.

## Simulation and Card Limit

If a credit card has a configured limit, the simulator can return:

- availableLimitBefore
- hypotheticalCommitment
- availableLimitAfter
- exceedsCreditLimit

If no limit is configured, limit status remains unknown/not configured. CoinQuest does not invent a limit.

## Simulation and Goals

A PurchaseScenario may include Goal context. The simulator can show:

- allocatedAmount
- goalCoverageGap

Goal allocation does not reduce the simulated purchase amount. A completed Goal does not mean cash is available and does not approve or register the purchase. Simulation tied to a Goal does not archive, complete, withdraw from, or otherwise change the Goal.

## Simulation Result Is Not Bank Balance

PurchaseSimulationResult reuses MonthlyProjection. Its projected and cumulative results are projected monthly results, not a real bank balance, not patrimony and not a guaranteed future account value.
