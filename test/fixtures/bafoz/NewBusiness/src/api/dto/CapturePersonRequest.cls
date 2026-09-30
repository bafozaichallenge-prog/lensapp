/*------------------------------------------------------------------------
    Class:    CapturePersonRequest
    Purpose:  DTO for POST /api/new-business/contracts/{id}/person
              (Section 31).
------------------------------------------------------------------------*/

USING Progress.Json.ObjectModel.JsonObject.

CLASS api.dto.CapturePersonRequest:

    DEFINE PUBLIC PROPERTY FirstName    AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY Surname      AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY DateOfBirth  AS DATE      NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY IDNumber     AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY Email        AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY MobileNumber AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY Address      AS CHARACTER NO-UNDO GET. SET.

    METHOD PUBLIC STATIC CapturePersonRequest FromJson (INPUT poJson AS JsonObject):
        DEFINE VARIABLE oRequest AS CapturePersonRequest NO-UNDO.
        oRequest = NEW CapturePersonRequest().

        IF poJson:Has("firstName") THEN
            oRequest:FirstName = poJson:GetCharacter("firstName").
        IF poJson:Has("surname") THEN
            oRequest:Surname = poJson:GetCharacter("surname").
        IF poJson:Has("dateOfBirth") THEN
            oRequest:DateOfBirth = CapturePersonRequest:ParseIsoDate(poJson:GetCharacter("dateOfBirth")).
        IF poJson:Has("idNumber") THEN
            oRequest:IDNumber = poJson:GetCharacter("idNumber").
        IF poJson:Has("email") THEN
            oRequest:Email = poJson:GetCharacter("email").
        IF poJson:Has("mobileNumber") THEN
            oRequest:MobileNumber = poJson:GetCharacter("mobileNumber").
        IF poJson:Has("address") THEN
            oRequest:Address = poJson:GetCharacter("address").

        RETURN oRequest.
    END METHOD.

    /* Parses a "YYYY-MM-DD" ISO-8601 date string, as used by the JSON
       request payloads in Section 31, independently of session date
       format. */
    METHOD PRIVATE STATIC DATE ParseIsoDate (INPUT pcIsoDate AS CHARACTER):
        IF pcIsoDate = "" OR pcIsoDate = ? THEN
            RETURN ?.
        RETURN DATE(
            INTEGER(SUBSTRING(pcIsoDate, 6, 2)),
            INTEGER(SUBSTRING(pcIsoDate, 9, 2)),
            INTEGER(SUBSTRING(pcIsoDate, 1, 4))).
    END METHOD.

END CLASS.
