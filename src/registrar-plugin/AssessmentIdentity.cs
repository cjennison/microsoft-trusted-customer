using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Xrm.Sdk;

namespace Mtc.Registrar
{
    public static class AssessmentIdentity
    {
        public static Guid ForMessage(Guid organizationId, string mailbox, string immutableId)
        {
            using (var hash = SHA256.Create())
                return new Guid(hash.ComputeHash(Encoding.UTF8.GetBytes(
                    organizationId.ToString("D") + "\n" + mailbox.ToLowerInvariant() + "\n" + immutableId)).Take(16).ToArray());
        }

        public static Entity[] ExactLegacy(IEnumerable<Entity> candidates, string mailbox, string immutableId)
        {
            return candidates.Where(candidate =>
                string.Equals(candidate.GetAttributeValue<string>("mtc_stablemessageid"), immutableId, StringComparison.Ordinal) &&
                string.Equals(candidate.GetAttributeValue<string>("mtc_mailboxreference"), mailbox, StringComparison.OrdinalIgnoreCase)).ToArray();
        }
    }
}
