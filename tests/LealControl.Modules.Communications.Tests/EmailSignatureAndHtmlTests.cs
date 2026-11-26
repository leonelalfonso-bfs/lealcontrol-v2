using LealControl.Modules.Communications.Infrastructure.Http;
using LealControl.Modules.Communications.Infrastructure.Services;
using MimeKit;
using Xunit;

namespace LealControl.Modules.Communications.Tests;

public sealed class EmailSignatureAndHtmlTests
{
    private const string TinyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

    [Fact]
    public void BuildBody_embeds_data_uri_signature_logo_as_cid_linked_resource()
    {
        var html = $"""<div>Hola,<br/><img src="data:image/png;base64,{TinyPngBase64}" alt="Logo" /></div>""";
        var builder = MailTransportService.BuildBody(html, "Hola");

        Assert.Contains("""src="cid:sig-logo-1@lealcontrol""", builder.HtmlBody);
        Assert.DoesNotContain("data:image/png;base64", builder.HtmlBody);
        var resource = Assert.Single(builder.LinkedResources);
        Assert.Equal("sig-logo-1@lealcontrol", resource.ContentId);
        Assert.Equal("image/png", resource.ContentType.MimeType);
    }

    [Fact]
    public void ExtractProcessedHtml_resolves_cid_image_even_when_sent_as_octet_stream_with_png_filename()
    {
        var mime = new MimeMessage();
        var builder = new BodyBuilder
        {
            HtmlBody = """<html><body><p>Saludos</p><img src="cid:firma-logo-01@outlook" /></body></html>"""
        };
        var part = new MimePart("application", "octet-stream")
        {
            Content = new MimeContent(new MemoryStream(Convert.FromBase64String(TinyPngBase64))),
            ContentId = "<firma-logo-01@outlook>",
            FileName = "firma.png",
            ContentTransferEncoding = ContentEncoding.Base64
        };
        builder.LinkedResources.Add(part);
        mime.Body = builder.ToMessageBody();

        var processed = CommunicationsEndpointHelpers.ExtractProcessedHtml(mime);

        Assert.NotNull(processed);
        Assert.Contains($"data:image/png;base64,{TinyPngBase64}", processed);
        Assert.DoesNotContain("cid:firma-logo-01@outlook", processed);
    }
}
