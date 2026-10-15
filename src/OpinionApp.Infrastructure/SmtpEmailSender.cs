using System.Net;
using System.Net.Mail;
using OpinionApp.Application;
using Microsoft.Extensions.Configuration;

namespace OpinionApp.Infrastructure;

public sealed class SmtpEmailSender(IConfiguration configuration) : IEmailSender
{
    public async Task SendAsync(string email, string subject, string htmlBody, CancellationToken cancellationToken)
    {
        var host = configuration["Email:Host"];
        if (string.IsNullOrWhiteSpace(host))
        {
            throw new InvalidOperationException("SMTP is not configured. Set Email__Host before sending email.");
        }

        using var message = new MailMessage(configuration["Email:From"] ?? "no-reply@opinionapp.local", email)
        {
            Subject = subject,
            Body = htmlBody,
            IsBodyHtml = true
        };
        using var client = new SmtpClient(host, configuration.GetValue("Email:Port", 1025))
        {
            EnableSsl = configuration.GetValue("Email:EnableSsl", false)
        };
        var username = configuration["Email:Username"];
        if (!string.IsNullOrEmpty(username))
        {
            client.Credentials = new NetworkCredential(username, configuration["Email:Password"]);
        }

        cancellationToken.ThrowIfCancellationRequested();
        await client.SendMailAsync(message, cancellationToken);
    }
}
