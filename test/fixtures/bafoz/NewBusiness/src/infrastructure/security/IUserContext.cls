/*------------------------------------------------------------------------
    Interface: IUserContext
    Purpose:   Abstraction over the authenticated caller. The web
              application assumes an authenticated user; controllers
              resolve an IUserContext implementation (e.g. from the
              inbound session/JWT) and pass it down to services so
              authorization and audit stamping have a single source of
              truth for "who is doing this".

    Requirements:  Section 38 - Security Considerations
------------------------------------------------------------------------*/

INTERFACE infrastructure.security.IUserContext:

    METHOD PUBLIC CHARACTER GetUserId ( ).

    METHOD PUBLIC CHARACTER GetUsername ( ).

    METHOD PUBLIC LOGICAL HasRole (INPUT pcRole AS CHARACTER).

END INTERFACE.
