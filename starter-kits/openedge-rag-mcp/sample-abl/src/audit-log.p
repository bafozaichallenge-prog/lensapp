/* audit-log.p - writes an audit trail row for business events */
DEFINE INPUT PARAMETER ipEvent  AS CHARACTER NO-UNDO.
DEFINE INPUT PARAMETER ipDetail AS CHARACTER NO-UNDO.

CREATE AuditTrail.
ASSIGN AuditTrail.Event  = ipEvent
       AuditTrail.Detail = ipDetail
       AuditTrail.At     = NOW.
