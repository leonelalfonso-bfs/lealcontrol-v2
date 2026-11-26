using LealControl.BuildingBlocks.Notices;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Testcontainers.PostgreSql;
using Xunit;

namespace LealControl.Modules.Communications.Tests;

/// <summary>Mails sin atender: horas hábiles (lunes a viernes, hora argentina) sin respuesta nuestra.</summary>
public sealed class UnattendedMailTests
{
    /// <summary>Hora argentina → UTC.</summary>
    private static DateTime Ar(int year, int month, int day, int hour) => new DateTime(year, month, day, hour, 0, 0, DateTimeKind.Utc).AddHours(3);

    [Theory]
    // Miércoles 25/11/2026 15 h → martes 15 h.
    [InlineData(2026, 11, 25, 15, 24, 2026, 11, 24, 15)]
    // Lunes 30/11 10 h → viernes 27/11 10 h (el fin de semana no cuenta).
    [InlineData(2026, 11, 30, 10, 24, 2026, 11, 27, 10)]
    // Sábado 28/11 al mediodía → viernes 27/11 0 h: del sábado no cuenta nada.
    [InlineData(2026, 11, 28, 12, 24, 2026, 11, 27, 0)]
    // Lunes 30/11 a la medianoche → viernes 27/11 0 h.
    [InlineData(2026, 11, 30, 0, 24, 2026, 11, 27, 0)]
    // Viernes 27/11 9 h con 48 h → miércoles 25/11 9 h.
    [InlineData(2026, 11, 27, 9, 48, 2026, 11, 25, 9)]
    public void Cutoff_counts_only_weekdays_in_argentina(int y, int m, int d, int h, int hours, int ey, int em, int ed, int eh) =>
        Assert.Equal(Ar(ey, em, ed, eh), ConversationAttention.Cutoff(Ar(y, m, d, h), hours));

    [Fact]
    public async Task Notice_lists_unanswered_mails_until_someone_replies()
    {
        await using var postgres = new PostgreSqlBuilder("postgres:16-alpine")
            .WithDatabase("communications_unattended_tests").WithUsername("leal").WithPassword("leal").Build();
        await postgres.StartAsync();
        var options = new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(postgres.GetConnectionString()).Options;
        var tenantId = Guid.NewGuid();
        var old = DateTime.UtcNow.AddDays(-7);
        var recent = DateTime.UtcNow.AddMinutes(-30);

        Conversation Incoming(string who, DateTime at) =>
            Conversation.Create(tenantId, "email", Guid.NewGuid().ToString("N"), who, who, who, null, "Consulta", at, EmailDirection.Incoming);

        var unanswered = Incoming("sin-respuesta@ejemplo.com", old);
        var answered = Incoming("respondido@ejemplo.com", old);
        answered.RecordMessage(EmailDirection.Outgoing, "Respuesta", old.AddHours(2), null);
        var linkedOnly = Incoming("vinculado@ejemplo.com", old);
        linkedOnly.LinkCustomer(Guid.NewGuid());
        var resolved = Incoming("resuelto@ejemplo.com", old);
        resolved.SetStatus("resolved");
        var fresh = Incoming("reciente@ejemplo.com", recent);
        var otherTenant = Conversation.Create(Guid.NewGuid(), "email", Guid.NewGuid().ToString("N"), "x@ejemplo.com", "x", "x@ejemplo.com", null, "Consulta", old, EmailDirection.Incoming);

        await using (var db = new CommunicationsDbContext(options))
        {
            await db.EnsureTablesCreatedAsync();
            db.Conversations.AddRange(unanswered, answered, linkedOnly, resolved, fresh, otherTenant);
            await db.SaveChangesAsync();
        }

        var provider = new UnattendedMailNotices();
        var context = new NoticeContext(tenantId, postgres.GetConnectionString(), DateOnly.FromDateTime(DateTime.UtcNow));
        var items = await provider.GetAsync(context, CancellationToken.None);

        // Vincular a un cliente no lo atiende: sigue en el aviso hasta que haya respuesta.
        Assert.Equal(["Sin responder: sin-respuesta@ejemplo.com", "Sin responder: vinculado@ejemplo.com"], items.Select(i => i.Title).Order().ToArray());
        Assert.All(items, i => Assert.Equal(NoticeSeverity.Critical, i.Severity));
        Assert.Contains(items, i => i.Link == $"/comunicaciones?conversation={unanswered.Id}");

        // Con un plazo mayor que la antigüedad, no hay nada sin atender.
        await using (var db = new CommunicationsDbContext(options))
        {
            var settings = CommunicationSettings.For(tenantId);
            settings.SetUnattendedAfterHours(240);
            db.Settings.Add(settings);
            await db.SaveChangesAsync();
        }
        Assert.Empty(await provider.GetAsync(context, CancellationToken.None));
    }
}
