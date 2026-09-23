using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace LealControl.Modules.Crm.Infrastructure.Arca;

internal static class ArcaCertificateLoader
{
    public static X509Certificate2 Load(string certificatePem, string privateKeyPem)
    {
        // SignedCms en Linux suele requerir cert exportado a PKCS#12 con clave.
        using var fromPem = X509Certificate2.CreateFromPem(certificatePem, privateKeyPem);
        return new X509Certificate2(fromPem.Export(X509ContentType.Pkcs12));
    }

    public static bool TryLoad(
        string? certificatePem,
        string? privateKeyPem,
        out X509Certificate2? certificate,
        out string? error)
    {
        certificate = null;
        error = null;

        if (string.IsNullOrWhiteSpace(certificatePem))
        {
            error = "Falta el certificado (.crt) en Configuración.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(privateKeyPem))
        {
            error = "Falta la clave privada (.key) asociada al certificado.";
            return false;
        }

        try
        {
            certificate = Load(certificatePem, privateKeyPem);
            return true;
        }
        catch (CryptographicException ex)
        {
            error = "El certificado y la clave no combinan o el PEM es inválido: " + ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = "No se pudo cargar el certificado ARCA: " + ex.Message;
            return false;
        }
    }
}
