/*------------------------------------------------------------------------
    Class:    PersonService
    Purpose:  Application service coordinating Person capture against
              persistence. No business rules live here - mandatory
              field validation is owned by Person.cls /
              PersonMandatoryDetailsRule.cls.

    Requirements:  Section 25 - Service Layer, BR-003
------------------------------------------------------------------------*/

USING domain.interfaces.IPersonService.
USING domain.interfaces.IPersonRepository.
USING domain.entities.Person.
USING infrastructure.logging.ILogger.

CLASS application.services.PersonService IMPLEMENTS IPersonService:

    DEFINE PRIVATE VARIABLE moPersonRepository AS IPersonRepository NO-UNDO.
    DEFINE PRIVATE VARIABLE moLogger           AS ILogger           NO-UNDO.

    CONSTRUCTOR PUBLIC PersonService (INPUT poPersonRepository AS IPersonRepository, INPUT poLogger AS ILogger):
        moPersonRepository = poPersonRepository.
        moLogger           = poLogger.
    END CONSTRUCTOR.

    METHOD PUBLIC Person CapturePerson
        ( INPUT pcFirstName    AS CHARACTER,
          INPUT pcSurname      AS CHARACTER,
          INPUT pdDateOfBirth  AS DATE,
          INPUT pcIDNumber     AS CHARACTER,
          INPUT pcEmail        AS CHARACTER,
          INPUT pcMobileNumber AS CHARACTER,
          INPUT pcAddress      AS CHARACTER,
          INPUT pcUserId       AS CHARACTER ):

        DEFINE VARIABLE oPerson   AS Person    NO-UNDO.
        DEFINE VARIABLE cPersonId AS CHARACTER NO-UNDO.

        cPersonId = moPersonRepository:GetNextPersonId().

        oPerson = NEW Person().
        oPerson:Create(cPersonId, pcFirstName, pcSurname, pdDateOfBirth, pcIDNumber, pcEmail, pcMobileNumber, pcAddress, pcUserId).

        moPersonRepository:Save(oPerson).

        IF VALID-OBJECT(moLogger) THEN
            moLogger:LogInfo("PersonService", SUBSTITUTE("Person &1 captured by &2", cPersonId, pcUserId)).

        RETURN oPerson.
    END METHOD.

    METHOD PUBLIC Person GetPerson (INPUT pcPersonId AS CHARACTER):
        RETURN moPersonRepository:GetById(pcPersonId).
    END METHOD.

END CLASS.
