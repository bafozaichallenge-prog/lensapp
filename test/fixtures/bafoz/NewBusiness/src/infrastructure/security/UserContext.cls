/*------------------------------------------------------------------------
    Class:    UserContext
    Purpose:  Default IUserContext implementation. In a real deployment
              this would be populated from the inbound HTTP
              session/JWT/OAuth token by the web transport layer; here it
              is constructed directly from resolved values so the rest
              of the codebase never needs to know how authentication was
              performed.

    Requirements:  Section 38 - Security Considerations

    Roles:
        NEW_BUSINESS_AGENT - may create contracts and capture data
        SUPERVISOR         - may additionally activate contracts
        ADMIN               - full access
------------------------------------------------------------------------*/

USING infrastructure.security.IUserContext.

CLASS infrastructure.security.UserContext IMPLEMENTS IUserContext:

    DEFINE PUBLIC STATIC PROPERTY ROLE_AGENT      AS CHARACTER NO-UNDO INITIAL "NEW_BUSINESS_AGENT" GET.
    DEFINE PUBLIC STATIC PROPERTY ROLE_SUPERVISOR AS CHARACTER NO-UNDO INITIAL "SUPERVISOR"         GET.
    DEFINE PUBLIC STATIC PROPERTY ROLE_ADMIN      AS CHARACTER NO-UNDO INITIAL "ADMIN"              GET.

    DEFINE PRIVATE VARIABLE mcUserId   AS CHARACTER NO-UNDO.
    DEFINE PRIVATE VARIABLE mcUsername AS CHARACTER NO-UNDO.
    DEFINE PRIVATE VARIABLE mcRoles    AS CHARACTER NO-UNDO. /* comma-separated */

    CONSTRUCTOR PUBLIC UserContext (INPUT pcUserId AS CHARACTER, INPUT pcUsername AS CHARACTER, INPUT pcRoles AS CHARACTER):
        mcUserId   = pcUserId.
        mcUsername = pcUsername.
        mcRoles    = pcRoles.
    END CONSTRUCTOR.

    METHOD PUBLIC CHARACTER GetUserId ( ):
        RETURN mcUserId.
    END METHOD.

    METHOD PUBLIC CHARACTER GetUsername ( ):
        RETURN mcUsername.
    END METHOD.

    METHOD PUBLIC LOGICAL HasRole (INPUT pcRole AS CHARACTER):
        RETURN LOOKUP(pcRole, mcRoles) > 0.
    END METHOD.

END CLASS.
