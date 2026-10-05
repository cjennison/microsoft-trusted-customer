using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Web;

public class Script : ScriptBase
{
    public override async Task<HttpResponseMessage> ExecuteAsync()
    {
        var operation = Context.OperationId;
        if (operation != "ListMailboxMessages")
        {
            try { operation = Encoding.UTF8.GetString(Convert.FromBase64String(operation)); }
            catch (FormatException) { throw new InvalidOperationException("Unsupported Graph paging operation."); }
        }
        if (operation != "ListMailboxMessages" || Context.Request.Method != HttpMethod.Get)
            throw new InvalidOperationException("Graph paging accepts only mailbox message metadata GET requests.");

        var initial = Context.Request.RequestUri;
        ValidateDestination(initial);
        IEnumerable<string> pageHeaders;
        if (Context.Request.Headers.TryGetValues("x-mtc-page-url", out pageHeaders))
        {
            var values = pageHeaders.ToArray();
            if (values.Length != 1)
                throw new InvalidOperationException("Ambiguous Graph pagination URL.");
            if (!string.IsNullOrWhiteSpace(values[0]))
            {
                Uri next;
                if (!Uri.TryCreate(values[0], UriKind.Absolute, out next))
                    throw new InvalidOperationException("Invalid Graph pagination URL.");
                ValidateDestination(next);
                if (!string.Equals(Uri.UnescapeDataString(next.AbsolutePath),
                    Uri.UnescapeDataString(initial.AbsolutePath), StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("Graph pagination attempted to leave the enrolled mailbox message collection.");
                Context.Request.RequestUri = next;
            }
            Context.Request.Headers.Remove("x-mtc-page-url");
        }
        Context.Request.Headers.Remove("Prefer");
        Context.Request.Headers.TryAddWithoutValidation("Prefer", "IdType=\"ImmutableId\"");
        return await Context.SendAsync(Context.Request, CancellationToken).ConfigureAwait(false);
    }

    private static void ValidateDestination(Uri uri)
    {
        if (uri == null || uri.Scheme != "https" || !uri.IsDefaultPort ||
            !string.Equals(uri.Host, "graph.microsoft.com", StringComparison.OrdinalIgnoreCase) ||
            !string.IsNullOrEmpty(uri.UserInfo) || !string.IsNullOrEmpty(uri.Fragment))
            throw new InvalidOperationException("Graph pagination requires the exact Microsoft Graph HTTPS origin.");
        var segments = uri.AbsolutePath.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length != 4 || segments[0] != "v1.0" || segments[1] != "users" || segments[3] != "messages")
            throw new InvalidOperationException("Graph pagination accepts only the scoped mailbox message collection.");
        var query = HttpUtility.ParseQueryString(uri.Query);
        var allowedQuery = new HashSet<string>(new[] { "$select", "$filter", "$top", "$orderby", "$skip", "$skiptoken" },
            StringComparer.OrdinalIgnoreCase);
        if (query.AllKeys.Any(key => key == null || !allowedQuery.Contains(key)))
            throw new InvalidOperationException("Unsupported Graph pagination query.");
        var allowedFields = new HashSet<string>(new[] {
            "id", "parentFolderId", "receivedDateTime", "from", "sender", "replyTo",
            "categories", "internetMessageHeaders", "internetMessageId"
        }, StringComparer.Ordinal);
        var fields = (query["$select"] ?? "").Split(',').Select(field => field.Trim()).ToArray();
        if (fields.Length == 0 || fields.Any(field => !allowedFields.Contains(field)) ||
            !fields.Contains("id") || !fields.Contains("internetMessageHeaders"))
            throw new InvalidOperationException("Graph pagination must request only the approved metadata and headers.");
    }
}
