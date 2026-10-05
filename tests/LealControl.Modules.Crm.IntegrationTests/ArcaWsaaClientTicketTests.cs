using System.Net;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Xml.Linq;
using LealControl.Modules.Crm.Infrastructure.Arca;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class ArcaWsaaClientTicketTests
{
    private sealed class Clock : TimeProvider
    {
        internal DateTimeOffset Now = DateTimeOffset.UtcNow;
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private sealed class Transport : HttpMessageHandler, IHttpClientFactory
    {
        internal int Calls;
        internal string Body = "";
        internal HttpStatusCode Status = HttpStatusCode.OK;
        public HttpClient CreateClient(string name) => new(this, disposeHandler: false);
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref Calls);
            return Task.FromResult(new HttpResponseMessage(Status) { Content = new StringContent(Body) });
        }
    }
    private static string Response(DateTimeOffset? expires) => new XElement("Envelope",
        new XElement("loginCmsReturn", new XElement("loginTicketResponse",
            new XElement("header", expires.HasValue ? new XElement("expirationTime", expires.Value.ToString("O")) : null),
            new XElement("credentials", new XElement("token", "fake-token"), new XElement("sign", "fake-sign"))).ToString())).ToString();

    [Fact]
    public async Task Different_client_instances_reuse_the_same_ticket_until_its_official_expiration()
    {
        using var rsa = RSA.Create(2048);
        using var cert = new CertificateRequest("CN=Local test", rsa, HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1).CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(1));
        var clock = new Clock(); var cache = new ArcaWsaaTicketCache(clock);
        using var transport = new Transport { Body = Response(clock.Now.AddHours(1)) };
        var first = new ArcaWsaaClient(transport, NullLogger<ArcaWsaaClient>.Instance, cache);
        var second = new ArcaWsaaClient(transport, NullLogger<ArcaWsaaClient>.Instance, cache);
        async Task<bool> Login(ArcaWsaaClient client) => (await client.LoginAsync(cert,
            cert.ExportCertificatePem(), rsa.ExportRSAPrivateKeyPem(), "wsfe", false, default)).Ok;
        Assert.True(await Login(first)); Assert.True(await Login(second)); Assert.Equal(1, transport.Calls);
        clock.Now = clock.Now.AddHours(1);
        transport.Body = Response(clock.Now.AddHours(1));
        Assert.True(await Login(second)); Assert.Equal(2, transport.Calls);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Missing_or_expired_response_is_not_accepted(bool expired)
    {
        using var rsa = RSA.Create(2048);
        using var cert = new CertificateRequest("CN=Local test", rsa, HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1).CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(1));
        var clock = new Clock(); var cache = new ArcaWsaaTicketCache(clock);
        using var transport = new Transport { Body = Response(expired ? clock.Now.AddMinutes(-1) : null) };
        var client = new ArcaWsaaClient(transport, NullLogger<ArcaWsaaClient>.Instance, cache);
        for (var i = 0; i < 2; i++)
            Assert.False((await client.LoginAsync(cert, cert.ExportCertificatePem(), rsa.ExportRSAPrivateKeyPem(),
                "wsfe", false, default)).Ok);
        Assert.Equal(2, transport.Calls);
    }

    [Fact]
    public async Task Existing_remote_ticket_is_a_failure_without_an_invented_retry_time()
    {
        using var rsa = RSA.Create(2048);
        using var cert = new CertificateRequest("CN=Local test", rsa, HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1).CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(1));
        using var transport = new Transport { Status = HttpStatusCode.InternalServerError,
            Body = "<Envelope><Fault><faultcode>ns:coe.alreadyAuthenticated</faultcode><faultstring>existing ticket</faultstring></Fault></Envelope>" };
        var client = new ArcaWsaaClient(transport, NullLogger<ArcaWsaaClient>.Instance, new ArcaWsaaTicketCache());
        var result = await client.LoginAsync(cert, cert.ExportCertificatePem(), rsa.ExportRSAPrivateKeyPem(),
            "wsfe", false, default);
        Assert.False(result.Ok); Assert.Null(result.Token); Assert.Null(result.Sign);
        Assert.Contains("No indica falta de permisos", result.Detail);
        Assert.DoesNotContain("1 minuto", result.Detail);
    }
}
