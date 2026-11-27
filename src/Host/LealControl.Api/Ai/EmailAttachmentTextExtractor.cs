using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using ExcelDataReader;
using LealControl.Modules.Communications.Infrastructure.Domain;
using UglyToad.PdfPig;

namespace LealControl.Api.Ai;

/// <summary>
/// Extrae texto plano de adjuntos comerciales (PDF, Excel, CSV, TXT) de forma determinística (0 tokens)
/// para enriquecer la lectura de mails con IA sin enviar archivos binarios pesados.
/// </summary>
public static partial class EmailAttachmentTextExtractor
{
    private const long MaxFileSizeBytes = 5 * 1024 * 1024; // 5 MB
    private const int MaxPdfPages = 6;
    private const int MaxExcelSheets = 3;
    private const int MaxExcelRowsPerSheet = 60;
    private const int MaxCharsPerAttachment = 2500;
    private const int MaxTotalChars = 4500;
    private const int MaxAttachments = 3;

    static EmailAttachmentTextExtractor()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    }

    public sealed record ExtractedAttachment(string FileName, string Text);

    public static IReadOnlyList<ExtractedAttachment> ExtractAll(IEnumerable<EmailAttachment> attachments)
    {
        var results = new List<ExtractedAttachment>();
        var totalChars = 0;

        foreach (var att in attachments)
        {
            if (results.Count >= MaxAttachments || totalChars >= MaxTotalChars) break;
            if (att.IsInline || att.Data is null || att.Data.Length == 0 || att.SizeBytes > MaxFileSizeBytes) continue;

            var ext = Path.GetExtension(att.FileName ?? "").ToLowerInvariant();
            var ct = (att.ContentType ?? "").ToLowerInvariant();

            string? raw = null;
            try
            {
                if (ext == ".pdf" || ct == "application/pdf")
                    raw = ExtractPdf(att.Data);
                else if (ext is ".xlsx" or ".xls" || ct.Contains("spreadsheetml") || ct.Contains("ms-excel"))
                    raw = ExtractExcel(att.Data);
                else if (ext is ".csv" or ".txt" || ct is "text/plain" or "text/csv")
                    raw = ExtractPlainText(att.Data);
            }
            catch
            {
                // Adjunto corrupto, protegido con contraseña o formato no soportado: se ignora sin frenar la lectura.
                raw = null;
            }

            if (string.IsNullOrWhiteSpace(raw)) continue;

            var cleaned = CleanText(raw);
            if (cleaned.Length == 0) continue;

            var remaining = Math.Min(MaxCharsPerAttachment, MaxTotalChars - totalChars);
            if (cleaned.Length > remaining) cleaned = cleaned[..remaining];

            results.Add(new ExtractedAttachment(att.FileName ?? "adjunto", cleaned));
            totalChars += cleaned.Length;
        }

        return results;
    }

    private static string ExtractPdf(byte[] data)
    {
        using var ms = new MemoryStream(data, writable: false);
        using var document = PdfDocument.Open(ms);
        var sb = new StringBuilder();
        var count = 0;
        foreach (var page in document.GetPages())
        {
            if (++count > MaxPdfPages || sb.Length >= MaxCharsPerAttachment * 2) break;
            var text = page.Text;
            if (!string.IsNullOrWhiteSpace(text))
            {
                sb.AppendLine(text);
            }
        }
        return sb.ToString();
    }

    private static string ExtractExcel(byte[] data)
    {
        using var ms = new MemoryStream(data, writable: false);
        using var reader = ExcelReaderFactory.CreateReader(ms);
        var sb = new StringBuilder();
        var sheetIndex = 0;
        do
        {
            if (++sheetIndex > MaxExcelSheets || sb.Length >= MaxCharsPerAttachment * 2) break;
            if (!string.IsNullOrWhiteSpace(reader.Name))
                sb.AppendLine($"[Hoja: {reader.Name}]");

            var rowCount = 0;
            while (reader.Read() && rowCount < MaxExcelRowsPerSheet && sb.Length < MaxCharsPerAttachment * 2)
            {
                var cells = new List<string>();
                for (var col = 0; col < Math.Min(reader.FieldCount, 12); col++)
                {
                    var val = reader.GetValue(col)?.ToString()?.Trim();
                    if (!string.IsNullOrWhiteSpace(val)) cells.Add(val);
                }
                if (cells.Count > 0)
                {
                    sb.AppendLine(string.Join(" | ", cells));
                    rowCount++;
                }
            }
        } while (reader.NextResult());

        return sb.ToString();
    }

    private static string ExtractPlainText(byte[] data)
    {
        return Encoding.UTF8.GetString(data);
    }

    private static string CleanText(string input)
    {
        var text = ControlChars().Replace(input, " ");
        text = MultiSpace().Replace(text, " ");
        text = MultiNewLine().Replace(text, "\n");
        return text.Trim();
    }

    [GeneratedRegex(@"[\x00-\x08\x0B\x0C\x0E-\x1F]")]
    private static partial Regex ControlChars();

    [GeneratedRegex(@"[ \t\u00a0]+")]
    private static partial Regex MultiSpace();

    [GeneratedRegex(@"\s*\n\s*")]
    private static partial Regex MultiNewLine();
}
