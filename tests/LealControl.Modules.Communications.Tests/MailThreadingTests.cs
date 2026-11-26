using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using MimeKit;
using Testcontainers.PostgreSql;
using Xunit;

namespace LealControl.Modules.Communications.Tests;

/// <summary>Agrupación de mails en conversaciones y fecha de cada mail.</summary>
public sealed class MailThreadingTests
{
    private static readonly DateTime Now = new(2026, 11, 26, 15, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Date_uses_the_header_unless_missing_or_from_the_future()
    {
        var header = new DateTimeOffset(2026, 11, 20, 10, 0, 0, TimeSpan.FromHours(-3));
        var server = new DateTimeOffset(2026, 11, 20, 13, 5, 0, TimeSpan.Zero);
        Assert.Equal(header.UtcDateTime, MailThreading.OccurredAtUtc(header, server, Now));
        Assert.Equal(server.UtcDateTime, MailThreading.OccurredAtUtc(DateTimeOffset.MinValue, server, Now));
        Assert.Equal(server.UtcDateTime, MailThreading.OccurredAtUtc(new DateTimeOffset(2027, 5, 1, 0, 0, 0, TimeSpan.Zero), server, Now));
        Assert.Equal(Now, MailThreading.OccurredAtUtc(DateTimeOffset.MinValue, null, Now));
    }

    [Theory]
    [InlineData("RE: Cotización balanza", "cotización balanza")]
    [InlineData("RV: re:  Fwd: Cotización   balanza", "cotización balanza")]
    [InlineData("Re[2]: Turno", "turno")]
    [InlineData("Reunión de obra", "reunión de obra")]
    public void Topic_drops_reply_prefixes(string subject, string topic) => Assert.Equal(topic, MailThreading.Topic(subject));

    [Fact]
    public async Task Replies_join_the_conversation_they_quote_or_its_subject()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine")
            .WithDatabase("communications_threading_tests").WithUsername("leal").WithPassword("leal").Build();
        await postgres.StartAsync();
        var options = new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(postgres.GetConnectionString()).Options;
        var tenantId = Guid.NewGuid();
        await using var db = new CommunicationsDbContext(options);
        await db.EnsureTablesCreatedAsync();

        // Un hilo ya cargado: la consulta original (raíz) y nuestra respuesta, que cita la raíz.
        EmailMessage Stored(string id, string key, string subject, string from, string to, DateTime at) =>
            EmailMessage.Create(tenantId, Guid.NewGuid(), id, null, key, EmailDirection.Incoming, subject, from, to, "", at, null, null, null, CommunicationChannelHelper.Email);
        db.EmailMessages.Add(Stored("raiz@cliente", "HILO-1", "Cotización balanza", "compras@cliente.com", "ventas@empresa.com", Now.AddDays(-3)));
        db.EmailMessages.Add(Stored("resp@empresa", "HILO-1", "RE: Cotización balanza", "ventas@empresa.com", "compras@cliente.com", Now.AddDays(-2)));
        await db.SaveChangesAsync();

        MimeMessage Mail(string subject, string? inReplyTo = null)
        {
            var mime = new MimeMessage { Subject = subject, MessageId = Guid.NewGuid().ToString("N") + "@cliente" };
            mime.From.Add(MailboxAddress.Parse("compras@cliente.com"));
            mime.To.Add(MailboxAddress.Parse("ventas@empresa.com"));
            if (inReplyTo is not null) mime.InReplyTo = inReplyTo;
            return mime;
        }

        // Cita solo nuestra respuesta (sin la cadena completa): igual va al hilo.
        Assert.Equal("HILO-1", await MailThreading.ResolveThreadKeyAsync(db, tenantId, Mail("RE: RE: Cotización balanza", "resp@empresa"), "compras@cliente.com", Now, default));
        // No cita nada pero es una respuesta al mismo asunto, del mismo contacto.
        Assert.Equal("HILO-1", await MailThreading.ResolveThreadKeyAsync(db, tenantId, Mail("RV: Cotización  balanza"), "compras@cliente.com", Now, default));
        // Mismo asunto sin "RE:", de otro contacto, o de otra empresa del sistema: conversación nueva.
        Assert.NotEqual("HILO-1", await MailThreading.ResolveThreadKeyAsync(db, tenantId, Mail("Cotización balanza"), "compras@cliente.com", Now, default));
        Assert.NotEqual("HILO-1", await MailThreading.ResolveThreadKeyAsync(db, tenantId, Mail("RE: Cotización balanza"), "otro@cliente.com", Now, default));
        Assert.NotEqual("HILO-1", await MailThreading.ResolveThreadKeyAsync(db, Guid.NewGuid(), Mail("RE: Cotización balanza", "resp@empresa"), "compras@cliente.com", Now, default));
    }
}
