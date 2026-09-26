using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure.Services;
using MailKit.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using MimeKit;

namespace LealControl.Modules.Communications.Infrastructure.Http;

public sealed record SaveMailAccountRequest(Guid? Id, MailAccountSettings Settings, string? Secret);
public sealed record SetMailAutoSyncRequest(bool Enabled);
public sealed record SendWhatsAppRequest(
    string To,
    string Message,
    string? MediaUrl = null,
    string? MediaType = null,
    string? FileName = null,
    string? MediaBase64 = null,
    string? MimeType = null,
    string? RelatedEntityType = null,
    Guid? RelatedEntityId = null,
    Guid? UserId = null,
    string? InstanceName = null
);
public sealed record ConfigureMetaChannelRequest(string ChannelType, string PageAccessToken);
public sealed record DisconnectMetaChannelRequest(string ChannelType);
public sealed record SendMetaMessageRequest(
    string ChannelType,
    string RecipientId,
    string Message,
    string? MediaUrl = null,
    string? MediaType = null,
    string? RelatedEntityType = null,
    Guid? RelatedEntityId = null
);
public sealed record LinkConversationRequest(Guid? LeadId, Guid? CustomerId);
public sealed record AssignConversationRequest(Guid? UserId);
public sealed record UpdateConversationStatusRequest(string Status);
public sealed record AddConversationNoteRequest(string Body);
public sealed record AddConversationTagRequest(string Name);
public sealed record SaveReplyTemplateRequest(Guid? Id, string Name, string Body, string? ChannelType);

public static class CommunicationsEndpoints
{
    public static IEndpointRouteBuilder MapCommunicationsModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/communications");
        group.MapCommunicationsMailEndpoints();
        group.MapCommunicationsWhatsAppEndpoints(endpoints);
        group.MapCommunicationsMetaEndpoints(endpoints);
        return endpoints;
    }
}

public sealed class CustomerMatchRow
{
    public Guid Id { get; set; }
    public string LegalName { get; set; } = "";
    public string? TradeName { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? WhatsApp { get; set; }
}
