using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Accounting.Infrastructure;

public static class AccountingEndpoints
{
    public static IEndpointRouteBuilder MapAccountingModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/accounting").WithTags("Accounting & Finance Professional").RequirePolicyOnWrites("RequireAccounting");

        group.MapAccountingAccountsEndpoints();
        group.MapAccountingJournalEndpoints();
        group.MapAccountingReportsEndpoints();
        group.MapAccountingPeriodsEndpoints();
        group.MapAccountingTemplatesEndpoints();
        group.MapAccountingBatchPostingEndpoints();

        return endpoints;
    }
}

public sealed record CreateAccountRequest(string Code, string Name, string? AccountType, int Level, string? ParentCode, bool IsDirectPosting, string? Currency, bool AdjustsForInflation);
public sealed record UpdateAccountRequest(string? Code, string Name, string? AccountType, int Level, string? ParentCode, bool IsDirectPosting, string? Currency, bool AdjustsForInflation, bool IsActive);
public sealed record CreateJournalEntryRequest(DateTime Date, string Concept, string? EntryType, string? SourceModule, string? SourceDocumentId, string? CreatedBy, List<JournalEntryLineRequest> Lines);
public sealed record JournalEntryLineRequest(Guid AccountId, string AccountCode, string AccountName, decimal Debit, decimal Credit, string? Currency, decimal ExchangeRate, Guid? CostCenterId, string? CostCenterCode, string? CostCenterName, string? Memo);
public sealed record CreateCostCenterRequest(string Code, string Name, string? Category);
public sealed record LockPeriodRequest(int Year, int Month, bool Lock, string? User);
public sealed record UpdateAccountingSettingsRequest(bool AutoPostOnConfirm);
public sealed record FinanceAccountMappingItemRequest(Guid FinancialAccountId, string LedgerAccountCode);
public sealed record AutoPostInvoiceRequest(Guid InvoiceId, string InvoiceNumber, string CustomerName, DateTime Date, decimal NetAmount, decimal VatAmount, decimal TotalAmount);
public sealed record AutoPostPurchaseRequest(Guid PurchaseId, string InvoiceNumber, string SupplierName, DateTime Date, decimal NetAmount, decimal VatAmount, decimal TotalAmount);
public sealed record AutoPostReceiptRequest(Guid ReceiptId, string ReceiptNumber, string CustomerName, DateTime Date, decimal Amount, string? PaymentMethod);
public sealed record UploadBankStatementRequest(string? BankName, string? AccountNumber, string? Currency, DateTime PeriodStartDate, DateTime PeriodEndDate, decimal InitialBalance, decimal FinalBalance, List<UploadBankStatementLineRequest> Lines);
public sealed record UploadBankStatementLineRequest(DateTime TransactionDate, string Description, string? ReferenceNumber, decimal Debit, decimal Credit, decimal Balance);
public sealed record QuickPostBankFeeRequest(string FeeType);
