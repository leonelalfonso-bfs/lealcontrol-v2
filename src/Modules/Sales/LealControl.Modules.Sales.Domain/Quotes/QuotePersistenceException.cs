namespace LealControl.Modules.Sales.Domain.Quotes;

public sealed class QuotePersistenceException : Exception
{
    public QuotePersistenceException(string message, bool isNumberCollision)
        : base(message)
    {
        IsNumberCollision = isNumberCollision;
    }

    public bool IsNumberCollision { get; }
}
