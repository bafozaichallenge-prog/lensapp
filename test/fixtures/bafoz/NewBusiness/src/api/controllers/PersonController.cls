/*------------------------------------------------------------------------
    Class:    PersonController
    Purpose:  Read-side endpoint for looking up a captured person.
              Section 29 - API Layer.
------------------------------------------------------------------------*/

USING domain.interfaces.IPersonService.
USING domain.entities.Person.
USING Progress.Json.ObjectModel.JsonObject.

CLASS api.controllers.PersonController:

    DEFINE PRIVATE VARIABLE moPersonService AS IPersonService NO-UNDO.

    CONSTRUCTOR PUBLIC PersonController (INPUT poPersonService AS IPersonService):
        moPersonService = poPersonService.
    END CONSTRUCTOR.

    /* GET /api/persons/{personId}
       Deliberately omits Address/Email from the response to avoid
       over-exposing personal information on a lookup endpoint not tied
       to the capture flow. */
    METHOD PUBLIC JsonObject GetPerson (INPUT pcPersonId AS CHARACTER):
        DEFINE VARIABLE oPerson AS Person      NO-UNDO.
        DEFINE VARIABLE oJson   AS JsonObject  NO-UNDO.

        oPerson = moPersonService:GetPerson(pcPersonId).

        oJson = NEW JsonObject().
        oJson:Add("personId", oPerson:PersonId).
        oJson:Add("firstName", oPerson:FirstName).
        oJson:Add("surname", oPerson:Surname).
        oJson:Add("mobileNumber", oPerson:MobileNumber).
        RETURN oJson.
    END METHOD.

END CLASS.
