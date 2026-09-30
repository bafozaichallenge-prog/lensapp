/*------------------------------------------------------------------------
    Class:    Person
    Purpose:  Represents the prospective client who will own the
              contract. Encapsulates its own mandatory-field validation
              so PersonMandatoryDetailsRule can delegate to it rather
              than duplicating field checks (Section 9).

    Requirements:  BR-003 - Capture Client Details, BRULE-003
------------------------------------------------------------------------*/

USING domain.entities.AbstractDomainEntity.

CLASS domain.entities.Person INHERITS AbstractDomainEntity:

    DEFINE PUBLIC PROPERTY PersonId      AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY FirstName     AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY Surname       AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY DateOfBirth   AS DATE      NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY IDNumber      AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY Email         AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY MobileNumber  AS CHARACTER NO-UNDO GET. PRIVATE SET.
    DEFINE PUBLIC PROPERTY Address       AS CHARACTER NO-UNDO GET. PRIVATE SET.

    CONSTRUCTOR PUBLIC Person ( ):
        SUPER ().
    END CONSTRUCTOR.

    METHOD PUBLIC OVERRIDE CHARACTER GetEntityName ( ):
        RETURN "Person".
    END METHOD.

    METHOD PUBLIC VOID Create
        ( INPUT pcPersonId     AS CHARACTER,
          INPUT pcFirstName    AS CHARACTER,
          INPUT pcSurname      AS CHARACTER,
          INPUT pdDateOfBirth  AS DATE,
          INPUT pcIDNumber     AS CHARACTER,
          INPUT pcEmail        AS CHARACTER,
          INPUT pcMobileNumber AS CHARACTER,
          INPUT pcAddress      AS CHARACTER,
          INPUT pcUserId       AS CHARACTER ):

        PersonId     = pcPersonId.
        THIS-OBJECT:StampCreated(pcUserId).
        THIS-OBJECT:UpdateDetails(pcFirstName, pcSurname, pdDateOfBirth, pcIDNumber, pcEmail, pcMobileNumber, pcAddress, pcUserId).
    END METHOD.

    METHOD PUBLIC VOID UpdateDetails
        ( INPUT pcFirstName    AS CHARACTER,
          INPUT pcSurname      AS CHARACTER,
          INPUT pdDateOfBirth  AS DATE,
          INPUT pcIDNumber     AS CHARACTER,
          INPUT pcEmail        AS CHARACTER,
          INPUT pcMobileNumber AS CHARACTER,
          INPUT pcAddress      AS CHARACTER,
          INPUT pcUserId       AS CHARACTER ):

        FirstName    = pcFirstName.
        Surname      = pcSurname.
        DateOfBirth  = pdDateOfBirth.
        IDNumber     = pcIDNumber.
        Email        = pcEmail.
        MobileNumber = pcMobileNumber.
        Address      = pcAddress.
        THIS-OBJECT:Touch(pcUserId).
    END METHOD.

    /* Encapsulates the person's own mandatory-field rule so
       PersonMandatoryDetailsRule (Section 45/17) simply delegates to
       this method instead of re-implementing field-level checks -
       Edge Cases: "Required person information missing",
       "Invalid date of birth". */
    METHOD PUBLIC LOGICAL ValidateMandatoryDetails (OUTPUT pcMissingFields AS CHARACTER):
        DEFINE VARIABLE cMissing AS CHARACTER NO-UNDO INITIAL "".

        IF FirstName = "" OR FirstName = ? THEN
            cMissing = cMissing + "FirstName,".
        IF Surname = "" OR Surname = ? THEN
            cMissing = cMissing + "Surname,".
        IF DateOfBirth = ? THEN
            cMissing = cMissing + "DateOfBirth,".
        ELSE IF DateOfBirth > TODAY THEN
            cMissing = cMissing + "DateOfBirth(future),".
        IF IDNumber = "" OR IDNumber = ? THEN
            cMissing = cMissing + "IDNumber,".
        IF MobileNumber = "" OR MobileNumber = ? THEN
            cMissing = cMissing + "MobileNumber,".

        IF cMissing <> "" THEN
            cMissing = TRIM(cMissing, ",").

        pcMissingFields = cMissing.
        RETURN cMissing = "".
    END METHOD.

END CLASS.
