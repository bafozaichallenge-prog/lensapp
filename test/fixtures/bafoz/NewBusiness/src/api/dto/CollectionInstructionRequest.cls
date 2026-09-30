/*------------------------------------------------------------------------
    Class:    CollectionInstructionRequest
    Purpose:  DTO for POST /api/new-business/contracts/{id}/collection
              (Section 31).
------------------------------------------------------------------------*/

USING Progress.Json.ObjectModel.JsonObject.

CLASS api.dto.CollectionInstructionRequest:

    DEFINE PUBLIC PROPERTY CollectionMethod  AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY CollectionDay     AS INTEGER   NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY AccountNumber     AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY BankCode          AS CHARACTER NO-UNDO GET. SET.
    DEFINE PUBLIC PROPERTY AccountHolderName AS CHARACTER NO-UNDO GET. SET.

    METHOD PUBLIC STATIC CollectionInstructionRequest FromJson (INPUT poJson AS JsonObject):
        DEFINE VARIABLE oRequest AS CollectionInstructionRequest NO-UNDO.
        oRequest = NEW CollectionInstructionRequest().

        IF poJson:Has("collectionMethod") THEN
            oRequest:CollectionMethod = poJson:GetCharacter("collectionMethod").
        IF poJson:Has("collectionDay") THEN
            oRequest:CollectionDay = poJson:GetInteger("collectionDay").
        IF poJson:Has("accountNumber") THEN
            oRequest:AccountNumber = poJson:GetCharacter("accountNumber").
        IF poJson:Has("bankCode") THEN
            oRequest:BankCode = poJson:GetCharacter("bankCode").
        IF poJson:Has("accountHolderName") THEN
            oRequest:AccountHolderName = poJson:GetCharacter("accountHolderName").

        RETURN oRequest.
    END METHOD.

END CLASS.
