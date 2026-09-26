using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
var dist = Path.Combine(root, "dist");
var version = args.Length > 0 ? args[0] : "0.1.1";

BuildPackage(new Package(
    "Rumble.Bot",
    "Streamer.bot integration for the documented Rumble Live Stream API.",
    Path.Combine(root, "src", "Rumble.Bot", "StreamerBotHost.cs.txt"),
    new[] { "Initialize", "Configure", "Start", "Stop", "Reconnect", "Status", "Test", "Overlay Event" },
    new[] { "StreamerBot.PlatformBridge.Core.dll", "Rumble.Bot.dll" }));

void BuildPackage(Package package)
{
    var packageDirectory = Path.Combine(dist, package.Name);
    var dllDirectory = Path.Combine(packageDirectory, "dlls");
    if (Directory.Exists(packageDirectory)) Directory.Delete(packageDirectory, true);
    Directory.CreateDirectory(dllDirectory);

    foreach (var dll in package.Dlls)
    {
        var project = dll == "StreamerBot.PlatformBridge.Core.dll" ? "StreamerBot.PlatformBridge.Core" : package.Name;
        var source = Path.Combine(root, "src", project, "bin", "Release", "net481", dll);
        if (!File.Exists(source)) throw new FileNotFoundException("Build the Release DLLs before packaging.", source);
        File.Copy(source, Path.Combine(dllDirectory, dll), true);
    }

    if (package.Name == "Rumble.Bot")
    {
        CopyDirectory(Path.Combine(root, "src", "Rumble.Bot", "combined-chat"), Path.Combine(packageDirectory, "combined-chat"));
    }

    File.Copy(Path.Combine(root, "docs", "INSTALLATION.md"), Path.Combine(packageDirectory, "README.md"), true);
    File.Copy(Path.Combine(root, "LICENSE"), Path.Combine(packageDirectory, "LICENSE"), true);

    var hostCode = File.ReadAllText(package.HostSource, Encoding.UTF8);
    var codeId = StableGuid(package.Name + ":host-code");
    var actions = new List<object> { HostAction(package, hostCode, codeId) };
    var shared = new Package("Combined Chat", "Shared display controls for all OBS chat views.", "", Array.Empty<string>(), new[] { "StreamerBot.PlatformBridge.Core.dll" });
    actions.Add(HostAction(shared, File.ReadAllText(Path.Combine(root, "tools", "BundleBuilder", "SharedChatHost.cs.txt")), StableGuid("Combined Chat:host-code"), "Controls"));
    foreach (var methodLabel in package.Methods)
    {
        var method = methodLabel.Replace(" ", string.Empty, StringComparison.Ordinal);
        actions.Add(ControlAction(package, methodLabel, method, codeId, method == "Initialize", method == "Configure"));
    }

    var bundle = new
    {
        meta = new { name = package.Name, author = "Dominic Bytes", version, description = package.Description, autoRunAction = (string?)null, minimumVersion = (string?)null },
        data = new { actions, queues = Array.Empty<object>(), commands = Array.Empty<object>(), websocketServers = Array.Empty<object>(), websocketClients = Array.Empty<object>(), timers = Array.Empty<object>() },
        version = 23,
        exportedFrom = "1.0.7",
        minimumVersion = "1.0.0-alpha.1"
    };

    var json = JsonSerializer.Serialize(bundle, new JsonSerializerOptions { PropertyNamingPolicy = null });
    using var payload = new MemoryStream();
    payload.Write(Encoding.ASCII.GetBytes("SBAE"));
    using (var gzip = new GZipStream(payload, CompressionLevel.Optimal, true))
    {
        gzip.Write(Encoding.UTF8.GetBytes(json));
    }
    File.WriteAllText(Path.Combine(packageDirectory, package.Name + ".sb"), Convert.ToBase64String(payload.ToArray()), new UTF8Encoding(false));
}

object HostAction(Package package, string code, string codeId, string label = "Host (do not run)") => Action(
    package,
    label,
    Array.Empty<object>(),
    new object[]
    {
        Comment("Plugin host code. Use the named control actions."),
        new
        {
            name = package.Name + " Host",
            description = package.Description,
            references = new[] { @"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\mscorlib.dll" }
                .Concat(package.Dlls.Select(dll => @".\dlls\" + dll)).ToArray(),
            byteCode = Convert.ToBase64String(Encoding.UTF8.GetBytes(code)),
            precompile = true,
            delayStart = false,
            saveResultToVariable = false,
            saveToVariable = (string?)null,
            id = codeId,
            weight = 0.0,
            type = 99999,
            parentId = (string?)null,
            enabled = true,
            index = 1
        }
    });

object ControlAction(Package package, string label, string method, string codeId, bool initialize, bool uiThread) => Action(
    package,
    label,
    initialize ? new object[] { new { id = StableGuid(package.Name + ":startup-trigger"), type = 706, enabled = true, exclusions = Array.Empty<object>() } } : Array.Empty<object>(),
    new object[]
    {
        Comment("Calls " + package.Name + "." + method + "."),
        new
        {
            executeCodeId = codeId,
            method,
            runOnUiThread = uiThread,
            saveResultToVariable = false,
            saveToVariable = (string?)null,
            id = StableGuid(package.Name + ":invoke:" + method),
            weight = 0.0,
            type = 99998,
            parentId = (string?)null,
            enabled = true,
            index = 1
        }
    });

object Action(Package package, string name, object[] triggers, object[] subActions) => new
{
    id = StableGuid(package.Name + ":action:" + name),
    queue = "00000000-0000-0000-0000-000000000000",
    enabled = true,
    excludeFromHistory = false,
    excludeFromPending = false,
    name = "[" + package.Name + "] " + name,
    group = "[" + package.Name + "]",
    alwaysRun = false,
    randomAction = false,
    concurrent = false,
    triggers,
    subActions,
    collapsedGroups = Array.Empty<object>()
};

object Comment(string value) => new
{
    value,
    color = "#3874CB",
    id = StableGuid("comment:" + value),
    weight = 0.0,
    type = 1009,
    parentId = (string?)null,
    enabled = true,
    index = 0
};

string StableGuid(string value)
{
    var hash = MD5.HashData(Encoding.UTF8.GetBytes(value));
    return new Guid(hash).ToString();
}

void CopyDirectory(string source, string destination)
{
    Directory.CreateDirectory(destination);
    foreach (var file in Directory.GetFiles(source))
    {
        File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), true);
    }
    foreach (var directory in Directory.GetDirectories(source))
    {
        CopyDirectory(directory, Path.Combine(destination, Path.GetFileName(directory)));
    }
}

sealed record Package(string Name, string Description, string HostSource, string[] Methods, string[] Dlls);
