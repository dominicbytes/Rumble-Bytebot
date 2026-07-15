using System;
using System.IO;
using System.Text;
using Newtonsoft.Json;

namespace StreamerBot.PlatformBridge.Core;

public sealed class JsonFileStore<T> where T : new()
{
    public JsonFileStore(string path)
    {
        Path = path ?? throw new ArgumentNullException(nameof(path));
    }

    public string Path { get; }

    public T Load()
    {
        if (!File.Exists(Path))
        {
            return new T();
        }

        var json = File.ReadAllText(Path, Encoding.UTF8);
        return JsonConvert.DeserializeObject<T>(json) ?? new T();
    }

    public bool TryLoad(out T value)
    {
        try
        {
            value = Load();
            return File.Exists(Path);
        }
        catch (IOException)
        {
            value = new T();
            return false;
        }
        catch (JsonException)
        {
            value = new T();
            return false;
        }
        catch (FormatException)
        {
            value = new T();
            return false;
        }
        catch (System.Security.Cryptography.CryptographicException)
        {
            value = new T();
            return false;
        }
    }

    public void Save(T value)
    {
        var directory = System.IO.Path.GetDirectoryName(Path);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var temporaryPath = Path + ".tmp";
        var json = JsonConvert.SerializeObject(value, Formatting.Indented);
        File.WriteAllText(temporaryPath, json, new UTF8Encoding(false));

        if (File.Exists(Path))
        {
            File.Replace(temporaryPath, Path, null);
        }
        else
        {
            File.Move(temporaryPath, Path);
        }
    }
}
