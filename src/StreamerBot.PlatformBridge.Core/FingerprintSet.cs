using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;

namespace StreamerBot.PlatformBridge.Core;

public sealed class FingerprintSet
{
    private readonly int capacity;
    private readonly Queue<string> order = new Queue<string>();
    private readonly HashSet<string> values = new HashSet<string>(StringComparer.Ordinal);

    public FingerprintSet(int capacity, IEnumerable<string>? initialValues = null)
    {
        if (capacity < 1)
        {
            throw new ArgumentOutOfRangeException(nameof(capacity));
        }

        this.capacity = capacity;
        if (initialValues != null)
        {
            foreach (var value in initialValues)
            {
                Add(value);
            }
        }
    }

    public bool Add(string fingerprint)
    {
        if (!values.Add(fingerprint))
        {
            return false;
        }

        order.Enqueue(fingerprint);
        while (order.Count > capacity)
        {
            values.Remove(order.Dequeue());
        }

        return true;
    }

    public IReadOnlyCollection<string> Snapshot() => order.ToArray();

    public static string Compute(params object?[] fields)
    {
        var canonical = string.Join("\u001f", Array.ConvertAll(fields, field => Convert.ToString(field, System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty));
        using var sha256 = SHA256.Create();
        var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(canonical));
        return Convert.ToBase64String(hash);
    }
}
